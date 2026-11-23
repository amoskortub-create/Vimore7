import { NextResponse } from 'next/server';
import { Query } from 'node-appwrite';
import { DATABASE_ID, getAdminDatabases } from '@/lib/appwrite-server';
import { COL } from '@/lib/appwrite';

export async function GET() {
  try {
    const db = getAdminDatabases();
    const [tracksRes, albumsRes, playlistsRes, playlistTracksRes] = await Promise.allSettled([
      db.listDocuments(DATABASE_ID, COL.TRACKS, [Query.orderDesc('$createdAt'), Query.limit(200)]),
      db.listDocuments(DATABASE_ID, COL.ALBUMS, [Query.orderDesc('$createdAt'), Query.limit(100)]),
      db.listDocuments(DATABASE_ID, COL.PLAYLISTS, [Query.orderDesc('$createdAt'), Query.limit(100)]),
      db.listDocuments(DATABASE_ID, COL.PLAYLIST_TRACKS, [Query.limit(200)]),
    ]);

    const tracks = tracksRes.status === 'fulfilled' ? tracksRes.value.documents : [];
    const albums = albumsRes.status === 'fulfilled' ? albumsRes.value.documents : [];
    const playlists = playlistsRes.status === 'fulfilled' ? playlistsRes.value.documents : [];
    const playlistTrackRows =
      playlistTracksRes.status === 'fulfilled' ? playlistTracksRes.value.documents : [];

    const albumTracks = tracks.filter((t: any) => Boolean(t.album_id));

    return NextResponse.json({
      tracks,
      albums,
      playlists,
      albumTracks,
      playlistTrackRows,
      playlistTrackDocs: playlistTrackRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { tracks: [], albums: [], playlists: [], albumTracks: [], playlistTrackRows: [], playlistTrackDocs: [], error: err?.message },
      { status: 200 }
    );
  }
}
