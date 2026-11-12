import { databases, DATABASE_ID, COL, BUCKET, ID, Permission, Query, Role, storage } from '@/lib/appwrite';
import { uploadViaClient } from '@/lib/upload';

export type CreatorPaymentStatus = 'pending' | 'confirmed' | 'rejected';
export type CreatorPaymentKind = 'lockedPost' | 'gift';

export interface CreatorPaymentRequest {
  kind: CreatorPaymentKind;
  buyerId: string;
  buyerName: string;
  creatorId: string;
  amountLRD: number;
  senderNumber: string;
  transactionId: string;
  screenshot?: File | null;
  postId?: string;
  giftType?: string;
}

function isLiberiaMobileNumber(value: string): boolean {
  return /^(?:077|088)\d{7}$/.test(value.trim().replace(/[\s-]/g, ''));
}

function withTimeout<T>(request: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after 5 seconds`)), 5000);
    request.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function getCreatorOrangeMoneyNumber(userId: string): Promise<string | null> {
  const result = await withTimeout(
    databases.listDocuments(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ]),
    'Orange Money account lookup',
  );
  const number = result.documents[0]?.orangeMoneyNumber;
  return typeof number === 'string' && isLiberiaMobileNumber(number) ? number : null;
}

export async function saveCreatorOrangeMoneyNumber(userId: string, accountName: string, rawNumber: string): Promise<void> {
  const orangeMoneyNumber = rawNumber.trim().replace(/[\s-]/g, '');
  if (!isLiberiaMobileNumber(orangeMoneyNumber)) {
    throw new Error('Enter a Liberia Orange Money number in 077XXXXXXX or 088XXXXXXX format.');
  }
  const result = await withTimeout(
    databases.listDocuments(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ]),
    'Orange Money account lookup',
  );
  const previous = result.documents[0];
  const now = new Date().toISOString();
  const data = {
    userId,
    orangeMoneyNumber,
    accountName: accountName.trim(),
    isVerified: true,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  if (previous) {
    await databases.updateDocument(DATABASE_ID, COL.CREATOR_ORANGE_MONEY_ACCOUNTS, previous.$id, data);
  } else {
    await databases.createDocument(
      DATABASE_ID,
      COL.CREATOR_ORANGE_MONEY_ACCOUNTS,
      userId,
      data,
      [Permission.read(Role.users()), Permission.update(Role.user(userId)), Permission.delete(Role.user(userId))],
    );
  }
}

export async function submitCreatorPayment(request: CreatorPaymentRequest): Promise<void> {
  const senderNumber = request.senderNumber.trim().replace(/[\s-]/g, '');
  const transactionId = request.transactionId.trim();
  if (!isLiberiaMobileNumber(senderNumber)) {
    throw new Error('Enter a sender number in 077XXXXXXX or 088XXXXXXX format.');
  }
  if (!transactionId) throw new Error('Enter the Orange Money Transaction ID / Reference.');
  if (!Number.isInteger(request.amountLRD) || request.amountLRD <= 0) throw new Error('Invalid payment amount.');
  if (request.kind === 'lockedPost' && !request.screenshot) throw new Error('Upload the payment screenshot to submit an unlock request.');
  if (request.kind === 'lockedPost') {
    if (!request.postId) throw new Error('A post is required for an unlock request.');
    const post = await withTimeout(
      databases.getDocument(DATABASE_ID, COL.POSTS, request.postId),
      'Locked post lookup',
    );
    if (post.user_id !== request.creatorId || post.is_locked !== true || Number(post.unlock_price) !== request.amountLRD) {
      throw new Error('The locked post price or creator changed. Refresh the post and try again.');
    }
  }

  const documentPermissions = [
    Permission.read(Role.user(request.buyerId)),
    Permission.read(Role.user(request.creatorId)),
    Permission.update(Role.user(request.creatorId)),
  ];
  const screenshotFileId = request.screenshot
    ? await uploadViaClient(request.screenshot, BUCKET.PAYMENT_SCREENSHOTS, undefined, [
      Permission.read(Role.user(request.buyerId)),
      Permission.read(Role.user(request.creatorId)),
    ])
    : '';
  const createdAt = new Date().toISOString();
  const fields = {
    buyerId: request.buyerId,
    buyerName: request.buyerName,
    creatorId: request.creatorId,
    amountLRD: request.amountLRD,
    senderNumber,
    transactionId,
    screenshotFileId,
    status: 'pending' satisfies CreatorPaymentStatus,
    createdAt,
    ...(request.postId ? { postId: request.postId } : {}),
    ...(request.giftType ? { giftType: request.giftType } : {}),
  };
  const collectionId = request.kind === 'lockedPost' ? COL.LOCKED_POST_PAYMENTS : COL.GIFTS;
  await databases.createDocument(DATABASE_ID, collectionId, ID.unique(), fields, documentPermissions);
  await databases.createDocument(DATABASE_ID, COL.NOTIFICATIONS, ID.unique(), {
    user_id: request.creatorId,
    from_user_id: request.buyerId,
    from_user_name: request.buyerName,
    type: request.kind === 'gift' ? 'SYSTEM' : 'POST',
    title: request.kind === 'gift' ? 'Gift payment to verify' : 'Locked post payment to verify',
    content: request.kind === 'gift'
      ? `${request.buyerName} sent ${request.giftType} (${request.amountLRD} LRD). Transaction ID: ${transactionId}.`
      : `${request.buyerName} paid ${request.amountLRD} LRD to unlock your post. Transaction ID: ${transactionId}.`,
    message: request.kind === 'gift'
      ? `${request.buyerName} sent ${request.giftType} (${request.amountLRD} LRD). Transaction ID: ${transactionId}.`
      : `${request.buyerName} paid ${request.amountLRD} LRD to unlock your post. Transaction ID: ${transactionId}.`,
    ...(request.postId ? { post_id: request.postId } : {}),
    is_read: false,
  });
}

export async function reviewCreatorPayment(
  kind: CreatorPaymentKind,
  document: Record<string, any>,
  creatorId: string,
  status: Exclude<CreatorPaymentStatus, 'pending'>,
): Promise<void> {
  if (document.creatorId !== creatorId) throw new Error('Only the creator can review this payment.');
  if (document.status !== 'pending') throw new Error('This payment request has already been reviewed.');
  const collectionId = kind === 'lockedPost' ? COL.LOCKED_POST_PAYMENTS : COL.GIFTS;
  await databases.updateDocument(DATABASE_ID, collectionId, document.$id, { status });
  if (kind === 'lockedPost' && status === 'confirmed') {
    try {
      const existing = await databases.listDocuments(DATABASE_ID, COL.POST_UNLOCKS, [
        Query.equal('user_id', document.buyerId),
        Query.equal('post_id', document.postId),
        Query.limit(1),
      ]);
      if (existing.documents.length === 0) {
        await databases.createDocument(DATABASE_ID, COL.POST_UNLOCKS, ID.unique(), {
          user_id: document.buyerId,
          post_id: document.postId,
        }, [Permission.read(Role.user(document.buyerId)), Permission.read(Role.user(creatorId))]);
      }
    } catch (error) {
      try {
        await databases.updateDocument(DATABASE_ID, collectionId, document.$id, { status: 'pending' });
      } catch (rollbackError) {
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        throw new Error(`Could not unlock the post (${error instanceof Error ? error.message : String(error)}). Payment status rollback failed: ${rollbackMessage}`);
      }
      throw error;
    }
  }
  const confirmed = status === 'confirmed';
  const itemName = kind === 'gift' ? `Gift payment (${document.giftType})` : 'Locked post payment';
  await databases.createDocument(DATABASE_ID, COL.NOTIFICATIONS, ID.unique(), {
    user_id: document.buyerId,
    from_user_id: creatorId,
    type: kind === 'gift' ? 'SYSTEM' : 'POST',
    title: confirmed ? 'Payment confirmed' : 'Payment not confirmed',
    content: confirmed
      ? `${itemName} for ${document.amountLRD} LRD was confirmed by the creator.`
      : 'Payment not confirmed by creator. Check Transaction ID and try again.',
    message: confirmed
      ? `${itemName} for ${document.amountLRD} LRD was confirmed by the creator.`
      : 'Payment not confirmed by creator. Check Transaction ID and try again.',
    ...(document.postId ? { post_id: document.postId } : {}),
    is_read: false,
  });
}

export function getPaymentScreenshotUrl(fileId: string): string {
  return fileId ? storage.getFileView(BUCKET.PAYMENT_SCREENSHOTS, fileId).toString() : '';
}
