package com.verse.feed;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdOptions;
import com.google.android.gms.ads.nativead.NativeAdView;
import android.view.ViewGroup;
import org.json.JSONObject;
import java.security.MessageDigest;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import java.io.ByteArrayOutputStream;

public class MainActivity extends BridgeActivity {
    private Boolean currentAppearanceLight = null;
    private NativeAd currentNativeAd = null;
    private NativeAdView nativeAdViewContainer = null;
    private View nativeAdClickTarget = null;
    private String cachedAdJsonString = null;
    private static final String NATIVE_AD_TEST_UNIT_ID = "ca-app-pub-3940256099942544/2247696110";
    private static final String NATIVE_AD_LIVE_UNIT_ID = "ca-app-pub-5829734517659644/6990835162";
    private boolean isAdLoading = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Initialize Google Mobile Ads SDK
        try {
            MobileAds.initialize(this, initializationStatus -> {
                preloadNextNativeAd();
            });
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Enable edge-to-edge drawing — content extends behind status bar and navigation bar
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.getDecorView().setBackgroundColor(Color.parseColor("#1F1D1B"));
        window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.parseColor("#1F1D1B")));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        // Default to light icons on dark background
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            currentAppearanceLight = false;
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
        }

        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.setBackgroundColor(Color.parseColor("#1F1D1B"));
            
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);

            // Add JavaScript Interface so web code can query native ads and signing cert
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public String getNextNativeAd() {
                    if (cachedAdJsonString != null) {
                        String result = cachedAdJsonString;
                        cachedAdJsonString = null; // Consume ad
                        MainActivity.this.runOnUiThread(() -> preloadNextNativeAd());
                        return result;
                    }
                    MainActivity.this.runOnUiThread(() -> preloadNextNativeAd());
                    return "{\"hasAd\":false}";
                }

                @JavascriptInterface
                public void performNativeAdClick() {
                    MainActivity.this.runOnUiThread(() -> {
                        if (nativeAdClickTarget != null) {
                            nativeAdClickTarget.performClick();
                        } else if (currentNativeAd != null) {
                            currentNativeAd.recordCustomClickGesture();
                        }
                    });
                }

                @JavascriptInterface
                public String getSigningCertSHA1() {
                    return MainActivity.this.getSigningCertSHA1();
                }

                @JavascriptInterface
                public void sendAuthEmail(String email, String type, String name, String code, String actionUrl) {
                    sendSmtpEmail(email, type, name, code, actionUrl);
                }

                @JavascriptInterface
                public void setStatusBarTheme(boolean isDarkTheme) {
                    final boolean targetAppearanceLight = !isDarkTheme;
                    if (currentAppearanceLight != null && currentAppearanceLight.booleanValue() == targetAppearanceLight) {
                        return; // State already applied, skip redundant window redraw
                    }
                    MainActivity.this.runOnUiThread(() -> {
                        if (currentAppearanceLight != null && currentAppearanceLight.booleanValue() == targetAppearanceLight) {
                            return;
                        }
                        currentAppearanceLight = targetAppearanceLight;
                        Window w = MainActivity.this.getWindow();
                        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
                        if (c != null) {
                            c.setAppearanceLightStatusBars(targetAppearanceLight);
                            c.setAppearanceLightNavigationBars(targetAppearanceLight);
                        }
                    });
                }
            }, "AppSigner");
        }
    }

    public static void sendSmtpEmail(String toEmail, String type, String name, String code, String actionUrl) {
        new Thread(() -> {
            try {
                String senderEmail = "versefeed.support@gmail.com";
                String appPass = "doklqswnbdxijcxb";
                String recipientName = (name != null && !name.trim().isEmpty()) ? name.trim() : "Friend";

                String subject = "VerseFeed Notification";
                String bodyHtml = "";

                if ("verify-email".equals(type)) {
                    subject = "Verify your VerseFeed account";
                    String cta = "";
                    if (code != null && !code.trim().isEmpty()) {
                        cta = "<div style=\"background: rgba(255,255,255,0.06); border: 1px solid rgba(212,175,55,0.4); border-radius: 12px; padding: 18px 24px; text-align: center; margin: 24px 0;\"><span style=\"font-size: 2rem; font-weight: 700; letter-spacing: 8px; color: #d4af37; font-family: monospace;\">" + code + "</span><p style=\"margin: 8px 0 0 0; font-size: 0.85rem; color: #a8a29e;\">This verification code expires in 15 minutes.</p></div>";
                    } else if (actionUrl != null && !actionUrl.trim().isEmpty()) {
                        cta = "<div style=\"text-align: center; margin: 28px 0;\"><a href=\"" + actionUrl + "\" style=\"background: linear-gradient(135deg, #d4af37, #b8860b); color: #1c1917; text-decoration: none; padding: 14px 36px; border-radius: 28px; font-weight: 700; font-size: 1rem; display: inline-block; box-shadow: 0 4px 14px rgba(0,0,0,0.3); letter-spacing: 0.5px;\">Verify Email Address</a></div>";
                    }
                    bodyHtml = "<p>Hello " + recipientName + ",</p><p>Welcome to <strong>VerseFeed</strong>. Please confirm your email address to sync your saved verses, custom albums, and notes securely across all your devices.</p>" + cta + "<p style=\"font-size: 0.85rem; color: #78716c; margin-top: 24px;\">If you did not create a VerseFeed account, you can safely ignore this email.</p>";
                } else if ("reset-password".equals(type)) {
                    subject = "Reset your VerseFeed password";
                    String cta = "";
                    if (actionUrl != null && !actionUrl.trim().isEmpty()) {
                        cta = "<div style=\"text-align: center; margin: 28px 0;\"><a href=\"" + actionUrl + "\" style=\"background: linear-gradient(135deg, #d4af37, #b8860b); color: #1c1917; text-decoration: none; padding: 14px 36px; border-radius: 28px; font-weight: 700; font-size: 1rem; display: inline-block; box-shadow: 0 4px 14px rgba(0,0,0,0.3); letter-spacing: 0.5px;\">Reset Password</a></div>";
                    } else if (code != null && !code.trim().isEmpty()) {
                        cta = "<div style=\"background: rgba(255,255,255,0.06); border: 1px solid rgba(212,175,55,0.4); border-radius: 12px; padding: 18px 24px; text-align: center; margin: 24px 0;\"><span style=\"font-size: 2rem; font-weight: 700; letter-spacing: 8px; color: #d4af37; font-family: monospace;\">" + code + "</span><p style=\"margin: 8px 0 0 0; font-size: 0.85rem; color: #a8a29e;\">This password reset code expires in 15 minutes.</p></div>";
                    }
                    bodyHtml = "<p>Hello " + recipientName + ",</p><p>We received a request to reset your VerseFeed account password. Click the button below to choose a new password:</p>" + cta + "<p style=\"font-size: 0.85rem; color: #78716c; margin-top: 24px;\">If you did not request a password reset, you can safely ignore this email.</p>";
                }

                String fullHtml = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"></head><body style=\"margin: 0; padding: 20px; background-color: #141210; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #e7e5e4;\"><div style=\"max-width: 520px; margin: 0 auto; background: #1f1d1b; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 32px 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);\"><div style=\"text-align: center; margin-bottom: 24px;\"><h1 style=\"margin: 0; font-size: 1.8rem; font-weight: 700; color: #d4af37; letter-spacing: 1px;\">VerseFeed</h1><p style=\"margin: 6px 0 0 0; font-size: 0.85rem; color: #a8a29e;\">Sacred Verses & Spiritual Mindfulness</p></div><div style=\"font-size: 1rem; line-height: 1.6; color: #d6d3d1;\">" + bodyHtml + "</div><div style=\"border-top: 1px solid rgba(255,255,255,0.08); margin-top: 32px; padding-top: 18px; text-align: center; font-size: 0.75rem; color: #78716c; line-height: 1.5;\"><p style=\"margin: 0;\"><strong>Privacy Guarantee:</strong> VerseFeed never sends promotional spam. This transactional email was sent to securely manage your account.</p></div></div></body></html>";

                javax.net.ssl.SSLSocketFactory factory = (javax.net.ssl.SSLSocketFactory) javax.net.ssl.SSLSocketFactory.getDefault();
                javax.net.ssl.SSLSocket socket = (javax.net.ssl.SSLSocket) factory.createSocket("smtp.gmail.com", 465);
                socket.setSoTimeout(10000);

                java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), java.nio.charset.StandardCharsets.UTF_8));
                java.io.BufferedWriter writer = new java.io.BufferedWriter(new java.io.OutputStreamWriter(socket.getOutputStream(), java.nio.charset.StandardCharsets.UTF_8));

                String line = reader.readLine(); // 220
                writer.write("EHLO localhost\r\n");
                writer.flush();

                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("250 ")) break;
                }

                writer.write("AUTH LOGIN\r\n");
                writer.flush();
                reader.readLine(); // 334 Username

                writer.write(Base64.encodeToString(senderEmail.getBytes(java.nio.charset.StandardCharsets.UTF_8), Base64.NO_WRAP) + "\r\n");
                writer.flush();
                reader.readLine(); // 334 Password

                writer.write(Base64.encodeToString(appPass.getBytes(java.nio.charset.StandardCharsets.UTF_8), Base64.NO_WRAP) + "\r\n");
                writer.flush();
                reader.readLine(); // 235 Accepted

                writer.write("MAIL FROM:<" + senderEmail + ">\r\n");
                writer.flush();
                reader.readLine(); // 250 OK

                writer.write("RCPT TO:<" + toEmail + ">\r\n");
                writer.flush();
                reader.readLine(); // 250 OK

                writer.write("DATA\r\n");
                writer.flush();
                reader.readLine(); // 354 Go ahead

                String emailPayload = "From: VerseFeed <" + senderEmail + ">\r\n" +
                        "To: <" + toEmail + ">\r\n" +
                        "Subject: " + subject + "\r\n" +
                        "MIME-Version: 1.0\r\n" +
                        "Content-Type: text/html; charset=UTF-8\r\n\r\n" +
                        fullHtml + "\r\n.\r\n";

                writer.write(emailPayload);
                writer.flush();
                reader.readLine(); // 250 OK sent

                writer.write("QUIT\r\n");
                writer.flush();
                socket.close();
                android.util.Log.d("VerseFeedMail", "Email successfully sent via native Gmail SMTP to " + toEmail);
            } catch (Exception e) {
                android.util.Log.e("VerseFeedMail", "Failed to send native SMTP email", e);
            }
        }).start();
    }

    private void attachNativeAdToView(NativeAd ad) {
        runOnUiThread(() -> {
            try {
                if (nativeAdViewContainer == null) {
                    nativeAdViewContainer = new NativeAdView(this);
                    nativeAdViewContainer.setLayoutParams(new ViewGroup.LayoutParams(1, 1));
                    nativeAdViewContainer.setVisibility(View.INVISIBLE);
                    nativeAdClickTarget = new View(this);
                    nativeAdClickTarget.setLayoutParams(new ViewGroup.LayoutParams(1, 1));
                    nativeAdViewContainer.addView(nativeAdClickTarget);
                    nativeAdViewContainer.setHeadlineView(nativeAdClickTarget);
                    nativeAdViewContainer.setBodyView(nativeAdClickTarget);
                    nativeAdViewContainer.setCallToActionView(nativeAdClickTarget);
                    
                    ViewGroup root = (ViewGroup) getWindow().getDecorView();
                    root.addView(nativeAdViewContainer);
                }
                nativeAdViewContainer.setNativeAd(ad);
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private JSONObject buildNativeAdJson(NativeAd nativeAd) {
        JSONObject json = new JSONObject();
        try {
            json.put("hasAd", true);
            json.put("headline", nativeAd.getHeadline() != null ? nativeAd.getHeadline() : "");
            json.put("body", nativeAd.getBody() != null ? nativeAd.getBody() : "");
            json.put("advertiser", nativeAd.getAdvertiser() != null ? nativeAd.getAdvertiser() : "");
            json.put("callToAction", nativeAd.getCallToAction() != null ? nativeAd.getCallToAction() : "Learn More");
            json.put("store", nativeAd.getStore() != null ? nativeAd.getStore() : "");
            json.put("price", nativeAd.getPrice() != null ? nativeAd.getPrice() : "");
            if (nativeAd.getStarRating() != null) {
                json.put("rating", nativeAd.getStarRating());
            }

            if (nativeAd.getIcon() != null && nativeAd.getIcon().getDrawable() != null) {
                Drawable drawable = nativeAd.getIcon().getDrawable();
                Bitmap bitmap = null;
                if (drawable instanceof BitmapDrawable) {
                    bitmap = ((BitmapDrawable) drawable).getBitmap();
                } else {
                    int w = Math.max(1, drawable.getIntrinsicWidth());
                    int h = Math.max(1, drawable.getIntrinsicHeight());
                    bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                    Canvas canvas = new Canvas(bitmap);
                    drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
                    drawable.draw(canvas);
                }
                if (bitmap != null) {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.PNG, 90, baos);
                    String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                    json.put("icon", "data:image/png;base64," + base64);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return json;
    }

    private void preloadNextNativeAd() {
        if (isAdLoading || cachedAdJsonString != null) return;
        isAdLoading = true;

        AdLoader.Builder builder = new AdLoader.Builder(this, NATIVE_AD_LIVE_UNIT_ID);
        builder.forNativeAd(nativeAd -> {
            if (currentNativeAd != null) {
                currentNativeAd.destroy();
            }
            currentNativeAd = nativeAd;
            attachNativeAdToView(nativeAd);
            cachedAdJsonString = buildNativeAdJson(nativeAd).toString();
            isAdLoading = false;
        });

        builder.withAdListener(new AdListener() {
            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                // Fallback to Google's official Native Test unit
                loadFallbackTestNativeAd();
            }
        });

        builder.withNativeAdOptions(new NativeAdOptions.Builder().build());
        AdLoader adLoader = builder.build();
        adLoader.loadAd(new AdRequest.Builder().build());
    }

    private void loadFallbackTestNativeAd() {
        AdLoader.Builder builder = new AdLoader.Builder(this, NATIVE_AD_TEST_UNIT_ID);
        builder.forNativeAd(nativeAd -> {
            if (currentNativeAd != null) {
                currentNativeAd.destroy();
            }
            currentNativeAd = nativeAd;
            attachNativeAdToView(nativeAd);
            cachedAdJsonString = buildNativeAdJson(nativeAd).toString();
            isAdLoading = false;
        });

        builder.withAdListener(new AdListener() {
            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                isAdLoading = false;
            }
        });

        AdLoader adLoader = builder.build();
        adLoader.loadAd(new AdRequest.Builder().build());
    }

    @Override
    public void onResume() {
        super.onResume();
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setTextZoom(100);
        }
    }

    public String getSigningCertSHA1() {
        try {
            Signature[] sigs = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = getPackageManager().getPackageInfo(
                    getPackageName(),
                    PackageManager.GET_SIGNING_CERTIFICATES
                );
                if (info.signingInfo != null) {
                    sigs = info.signingInfo.getSigningCertificateHistory();
                    if (sigs == null || sigs.length == 0) {
                        sigs = info.signingInfo.getApkContentsSigners();
                    }
                }
            }
            if (sigs == null || sigs.length == 0) {
                @SuppressWarnings("deprecation")
                PackageInfo info = getPackageManager().getPackageInfo(
                    getPackageName(),
                    PackageManager.GET_SIGNATURES
                );
                sigs = info.signatures;
            }
            if (sigs != null && sigs.length > 0) {
                StringBuilder allSigs = new StringBuilder();
                MessageDigest md = MessageDigest.getInstance("SHA-1");
                for (int s = 0; s < sigs.length; s++) {
                    byte[] digest = md.digest(sigs[s].toByteArray());
                    if (s > 0) allSigs.append("\n");
                    for (int i = 0; i < digest.length; i++) {
                        if (i > 0) allSigs.append(":");
                        allSigs.append(String.format("%02X", digest[i]));
                    }
                    md.reset();
                }
                return allSigs.toString();
            }
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
        return "No certs found";
    }
}
