package cfd.mediatech.vimore;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
	private static final int PERMISSIONS_REQUEST_CODE = 100;
	private static final int WEB_PERMISSION_REQUEST_CODE = 101;
	private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 102;
	private static final long TEN_MINUTES_MS = 10 * 60 * 1000L;
	private static final String PREFS_NAME = "vimore_prefs";
	private static final String KEY_NOTIFICATION_PROMPTED = "notification_prompted";
	private PermissionRequest pendingWebPermissionRequest;

	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		createNotificationChannel();
		if (getBridge() != null) {
			getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
			getBridge().getWebView().getSettings().setDomStorageEnabled(true);
			getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
			getBridge().getWebView().setWebChromeClient(new ViMoreWebChromeClient(getBridge()));
		}
		requestMediaAndLocationPermissions();
		scheduleNotificationPermissionPrompt();
	}

	private void createNotificationChannel() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			NotificationChannel channel = new NotificationChannel(
				"vimore_default_v2",
				"ViMore notifications",
				NotificationManager.IMPORTANCE_DEFAULT
			);
			channel.setDescription("Messages, activity, and updates from ViMore");
			channel.setSound(
				RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
				new AudioAttributes.Builder()
					.setUsage(AudioAttributes.USAGE_NOTIFICATION)
					.setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
					.build()
			);
			NotificationChannel callsChannel = new NotificationChannel(
				"vimore_calls_v2",
				"Incoming calls",
				NotificationManager.IMPORTANCE_HIGH
			);
			callsChannel.setDescription("Incoming ViMore audio and video calls");
			callsChannel.setSound(
				RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
				new AudioAttributes.Builder()
					.setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
					.setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
					.build()
			);
			callsChannel.enableVibration(true);
			NotificationManager manager = getSystemService(NotificationManager.class);
			if (manager != null) {
				manager.createNotificationChannel(channel);
				manager.createNotificationChannel(callsChannel);
			}
		}
	}

	private void requestMediaAndLocationPermissions() {
		if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) {
			return;
		}

		String[] permissions = {
			Manifest.permission.CAMERA,
			Manifest.permission.RECORD_AUDIO,
			Manifest.permission.ACCESS_COARSE_LOCATION,
			Manifest.permission.ACCESS_FINE_LOCATION
		};

		boolean needsPermission = false;
		for (String permission : permissions) {
			if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
				needsPermission = true;
				break;
			}
		}

		if (needsPermission) {
			ActivityCompat.requestPermissions(this, permissions, PERMISSIONS_REQUEST_CODE);
		}
	}

	private void scheduleNotificationPermissionPrompt() {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
			return;
		}
		SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
		if (prefs.getBoolean(KEY_NOTIFICATION_PROMPTED, false)) {
			return;
		}
		if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
			prefs.edit().putBoolean(KEY_NOTIFICATION_PROMPTED, true).apply();
			return;
		}

		new Handler(Looper.getMainLooper()).postDelayed(() -> {
			ActivityCompat.requestPermissions(
				this,
				new String[] { Manifest.permission.POST_NOTIFICATIONS },
				NOTIFICATION_PERMISSION_REQUEST_CODE
			);
			prefs.edit().putBoolean(KEY_NOTIFICATION_PROMPTED, true).apply();
		}, TEN_MINUTES_MS);
	}

	private class ViMoreWebChromeClient extends BridgeWebChromeClient {
		ViMoreWebChromeClient(com.getcapacitor.Bridge bridge) {
			super(bridge);
		}

		@Override
		public void onPermissionRequest(PermissionRequest request) {
			boolean needsAudio = false;
			boolean needsCamera = false;
			for (String resource : request.getResources()) {
				if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) needsAudio = true;
				if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) needsCamera = true;
			}

			if (!needsAudio && !needsCamera) {
				request.grant(request.getResources());
				return;
			}

			boolean audioGranted = !needsAudio || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
			boolean cameraGranted = !needsCamera || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
			if (audioGranted && cameraGranted) {
				request.grant(request.getResources());
				return;
			}

			pendingWebPermissionRequest = request;
			java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
			if (needsAudio) permissions.add(Manifest.permission.RECORD_AUDIO);
			if (needsCamera) permissions.add(Manifest.permission.CAMERA);
			ActivityCompat.requestPermissions(MainActivity.this, permissions.toArray(new String[0]), WEB_PERMISSION_REQUEST_CODE);
		}
	}

	@Override
	public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
		if (requestCode == WEB_PERMISSION_REQUEST_CODE && pendingWebPermissionRequest != null) {
			boolean granted = grantResults.length > 0;
			for (int result : grantResults) granted = granted && result == PackageManager.PERMISSION_GRANTED;
			if (granted) pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
			else pendingWebPermissionRequest.deny();
			pendingWebPermissionRequest = null;
			return;
		}
		if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
			SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
			prefs.edit().putBoolean(KEY_NOTIFICATION_PROMPTED, true).apply();
		}
		super.onRequestPermissionsResult(requestCode, permissions, grantResults);
	}

	@Override
	public void onBackPressed() {
		if (getBridge() != null && getBridge().getWebView().canGoBack()) {
			getBridge().getWebView().goBack();
			return;
		}

		super.onBackPressed();
	}
}
