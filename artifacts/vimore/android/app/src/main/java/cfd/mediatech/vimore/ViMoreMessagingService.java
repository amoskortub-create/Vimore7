package cfd.mediatech.vimore;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class ViMoreMessagingService extends MessagingService {
	private static final String DEFAULT_CHANNEL_ID = "vimore_default_v2";
	private static final String CALLS_CHANNEL_ID = "vimore_calls_v2";

	@Override
	public void onMessageReceived(RemoteMessage message) {
		if (PushNotificationsPlugin.getPushNotificationsInstance() != null) {
			super.onMessageReceived(message);
			return;
		}

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
			&& checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
			return;
		}

		RemoteMessage.Notification remoteNotification = message.getNotification();
		if (remoteNotification == null) {
			return;
		}

		String channelId = remoteNotification.getChannelId();
		if (channelId == null || channelId.isEmpty()) {
			channelId = DEFAULT_CHANNEL_ID;
		}
		String title = remoteNotification.getTitle();
		String body = remoteNotification.getBody();
		Intent openIntent = new Intent(this, MainActivity.class)
			.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
		for (String key : message.getData().keySet()) {
			openIntent.putExtra(key, message.getData().get(key));
		}
		openIntent.putExtra("google.message_id", message.getMessageId());

		PendingIntent contentIntent = PendingIntent.getActivity(
			this,
			message.getMessageId() == null ? (int) System.currentTimeMillis() : message.getMessageId().hashCode(),
			openIntent,
			PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
		);
		NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
			.setSmallIcon(R.mipmap.ic_launcher)
			.setContentTitle(title == null || title.isEmpty() ? "ViMore" : title)
			.setContentText(body == null ? "" : body)
			.setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
			.setPriority(channelId.equals(CALLS_CHANNEL_ID)
				? NotificationCompat.PRIORITY_HIGH
				: NotificationCompat.PRIORITY_DEFAULT)
			.setCategory(channelId.equals(CALLS_CHANNEL_ID)
				? NotificationCompat.CATEGORY_CALL
				: NotificationCompat.CATEGORY_MESSAGE)
			.setAutoCancel(true)
			.setContentIntent(contentIntent);

		String tag = message.getData().get("tag");
		int notificationId = message.getMessageId() == null
			? (int) System.currentTimeMillis()
			: message.getMessageId().hashCode();
		NotificationManagerCompat.from(this).notify(tag, notificationId, builder.build());
	}
}
