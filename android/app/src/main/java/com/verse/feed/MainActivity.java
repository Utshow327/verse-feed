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
import org.json.JSONObject;
import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
    private Boolean currentAppearanceLight = null;
    private NativeAd currentNativeAd = null;
    private String cachedAdJsonString = null;
    private static final String NATIVE_AD_TEST_UNIT_ID = "ca-app-pub-3940256099942544/2247696110";
    private static final String NATIVE_AD_LIVE_UNIT_ID = "ca-app-pub-5829734517659644/6965598630";
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
                public String getSigningCertSHA1() {
                    return MainActivity.this.getSigningCertSHA1();
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

    private void preloadNextNativeAd() {
        if (isAdLoading || cachedAdJsonString != null) return;
        isAdLoading = true;

        AdLoader.Builder builder = new AdLoader.Builder(this, NATIVE_AD_LIVE_UNIT_ID);
        builder.forNativeAd(nativeAd -> {
            if (currentNativeAd != null) {
                currentNativeAd.destroy();
            }
            currentNativeAd = nativeAd;
            try {
                JSONObject json = new JSONObject();
                json.put("hasAd", true);
                json.put("headline", nativeAd.getHeadline() != null ? nativeAd.getHeadline() : "");
                json.put("body", nativeAd.getBody() != null ? nativeAd.getBody() : "");
                json.put("advertiser", nativeAd.getAdvertiser() != null ? nativeAd.getAdvertiser() : "");
                json.put("callToAction", nativeAd.getCallToAction() != null ? nativeAd.getCallToAction() : "Learn More");
                cachedAdJsonString = json.toString();
            } catch (Exception e) {
                e.printStackTrace();
            }
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
            try {
                JSONObject json = new JSONObject();
                json.put("hasAd", true);
                json.put("headline", nativeAd.getHeadline() != null ? nativeAd.getHeadline() : "");
                json.put("body", nativeAd.getBody() != null ? nativeAd.getBody() : "");
                json.put("advertiser", nativeAd.getAdvertiser() != null ? nativeAd.getAdvertiser() : "");
                json.put("callToAction", nativeAd.getCallToAction() != null ? nativeAd.getCallToAction() : "Learn More");
                cachedAdJsonString = json.toString();
            } catch (Exception e) {
                e.printStackTrace();
            }
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
