import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import './Dialog.css';

type Tone = 'info' | 'danger' | 'error';

type Request = {
  title: string;
  message?: string;
  tone: Tone;
  confirmLabel: string;
  cancelLabel?: string;
  resolve: (value: boolean) => void;
};

type DialogApi = {
  alert: (options: {
    title: string;
    message?: string;
    tone?: Tone;
  }) => Promise<void>;
  confirm: (options: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
};

const TONE_ICON = {
  info: Info,
  danger: TriangleAlert,
  error: CircleAlert,
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);

  const close = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };

  const api = useMemo<DialogApi>(
    () => ({
      alert: ({ title, message, tone = 'info' }) =>
        new Promise<void>(resolve => {
          setRequest({
            title,
            message,
            tone,
            confirmLabel: 'Oke',
            resolve: () => resolve(),
          });
        }),
      confirm: ({
        title,
        message,
        confirmLabel = 'Ya',
        cancelLabel = 'Batal',
        destructive = false,
      }) =>
        new Promise<boolean>(resolve => {
          setRequest({
            title,
            message,
            tone: destructive ? 'danger' : 'info',
            confirmLabel,
            cancelLabel,
            resolve,
          });
        }),
    }),
    [],
  );

  const Icon = request ? TONE_ICON[request.tone] : Info;
  const danger = request?.tone !== 'info';

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request ? (
        <div className="dialog-backdrop" role="dialog" aria-modal="true">
          <div className="dialog">
            <span className={`badge${danger ? ' danger' : ''}`}>
              <Icon size={26} />
            </span>
            <h3>{request.title}</h3>
            {request.message ? <p>{request.message}</p> : null}
            <div className="actions">
              {request.cancelLabel ? (
                <button
                  type="button"
                  className="btn neutral block"
                  onClick={() => close(false)}
                >
                  {request.cancelLabel}
                </button>
              ) : null}
              <button
                type="button"
                className={`btn block${danger && request.cancelLabel ? ' danger' : ''}`}
                onClick={() => close(true)}
                autoFocus
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const api = useContext(DialogContext);
  if (!api) {
    throw new Error('useDialog harus dipakai di dalam DialogProvider');
  }
  return api;
}

// Pembungkus praktis: jalankan aksi, tampilkan dialog kalau gagal.
export function useErrorDialog() {
  const dialog = useDialog();
  return useCallback(
    async (title: string, error: unknown) => {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Coba lagi beberapa saat lagi.';
      await dialog.alert({ title, message, tone: 'error' });
    },
    [dialog],
  );
}
