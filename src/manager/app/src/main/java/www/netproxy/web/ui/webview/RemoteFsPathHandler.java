package www.netproxy.web.ui.webview;

import android.content.Context;
import android.util.Log;
import android.webkit.WebResourceResponse;

import androidx.annotation.NonNull;
import androidx.annotation.WorkerThread;
import androidx.webkit.WebViewAssetLoader;

import com.topjohnwu.superuser.nio.FileSystemManager;

import www.netproxy.web.ui.util.Insets;
import www.netproxy.web.ui.util.MonetColorsProvider;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;

/**
 * Handler class to open files from file system by root access
 */
public final class RemoteFsPathHandler implements WebViewAssetLoader.PathHandler {
    private static final String TAG = "FsServicePathHandler";

    public static final String DEFAULT_MIME_TYPE = "text/plain";

    private static final String[] FORBIDDEN_DATA_DIRS =
            new String[] {"/data/data", "/data/system"};

    @NonNull
    private final File mDirectory;

    private final FileSystemManager mFs;

    private final InsetsSupplier mInsetsSupplier;
    private final OnInsetsRequestedListener mOnInsetsRequestedListener;

    public interface InsetsSupplier {
        @NonNull
        Insets get();
    }

    public interface OnInsetsRequestedListener {
        void onInsetsRequested(boolean enable);
    }

    public RemoteFsPathHandler(
            @NonNull Context context,
            @NonNull File directory,
            FileSystemManager fs,
            @NonNull InsetsSupplier insetsSupplier,
            OnInsetsRequestedListener onInsetsRequestedListener
    ) {
        try {
            mInsetsSupplier = insetsSupplier;
            mOnInsetsRequestedListener = onInsetsRequestedListener;
            mDirectory = new File(getCanonicalDirPath(directory));
            if (!isAllowedInternalStorageDir(context)) {
                throw new IllegalArgumentException("The given directory \"" + directory
                        + "\" doesn't exist under an allowed app internal storage directory");
            }
            mFs = fs;
        } catch (IOException e) {
            throw new IllegalArgumentException(
                    "Failed to resolve the canonical path for the given directory: "
                            + directory.getPath(), e);
        }
    }

    private boolean isAllowedInternalStorageDir(@NonNull Context context) throws IOException {
        String dir = getCanonicalDirPath(mDirectory);

        for (String forbiddenPath : FORBIDDEN_DATA_DIRS) {
            if (dir.startsWith(forbiddenPath)) {
                return false;
            }
        }
        return true;
    }

    @Override
    @WorkerThread
    @NonNull
    public WebResourceResponse handle(@NonNull String path) {
        if ("internal/insets.css".equals(path)) {
            if (mOnInsetsRequestedListener != null) {
                mOnInsetsRequestedListener.onInsetsRequested(true);
            }
            String css = mInsetsSupplier.get().getCss();
            return new WebResourceResponse(
                "text/css",
                "utf-8",
                new ByteArrayInputStream(css.getBytes(StandardCharsets.UTF_8))
            );
        }
        if ("internal/colors.css".equals(path)) {
            String css = MonetColorsProvider.INSTANCE.getCss();
            return new WebResourceResponse(
                "text/css",
                "utf-8",
                new ByteArrayInputStream(css.getBytes(StandardCharsets.UTF_8))
            );
        }
        try {
            File file = getCanonicalFileIfChild(mDirectory, path);
            if (file != null) {
                InputStream is = openFile(file, mFs);
                String mimeType = guessMimeType(path);
                return new WebResourceResponse(mimeType, null, is);
            } else {
                Log.e(TAG, String.format(
                        "The requested file: %s is outside the mounted directory: %s", path,
                        mDirectory));
            }
        } catch (IOException e) {
            Log.e(TAG, "Error opening the requested path: " + path, e);
        }
        return new WebResourceResponse(null, null, null);
    }

    public static String getCanonicalDirPath(@NonNull File file) throws IOException {
        String canonicalPath = file.getCanonicalPath();
        if (!canonicalPath.endsWith("/")) canonicalPath += "/";
        return canonicalPath;
    }

    public static File getCanonicalFileIfChild(@NonNull File parent, @NonNull String child)
            throws IOException {
        String parentCanonicalPath = getCanonicalDirPath(parent);
        String childCanonicalPath = new File(parent, child).getCanonicalPath();
        if (childCanonicalPath.startsWith(parentCanonicalPath)) {
            return new File(childCanonicalPath);
        }
        return null;
    }

    @NonNull
    private static InputStream handleSvgzStream(@NonNull String path,
                                                @NonNull InputStream stream) throws IOException {
        return path.endsWith(".svgz") ? new GZIPInputStream(stream) : stream;
    }

    public static InputStream openFile(@NonNull File file, @NonNull FileSystemManager fs) throws IOException {
        return handleSvgzStream(file.getPath(), fs.getFile(file.getAbsolutePath()).newInputStream());
    }

    @NonNull
    public static String guessMimeType(@NonNull String filePath) {
        String mimeType = MimeUtil.getMimeFromFileName(filePath);
        return mimeType == null ? DEFAULT_MIME_TYPE : mimeType;
    }
}
