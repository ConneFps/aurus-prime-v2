import { Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../ui';
import { useSettings } from './settings';

/**
 * Sai automaticamente após N minutos sem atividade (Configurações → idleTimeoutMinutes),
 * com aviso de 60 segundos. Mantém a regra de segurança da v1.
 */
export function IdleGuard({ onTimeout }: { onTimeout: () => void }) {
  const { settings } = useSettings();
  const minutes = settings.idleTimeoutMinutes;
  const [warning, setWarning] = useState(false);
  const [left, setLeft] = useState(60);
  const last = useRef(Date.now());
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;
  const warningRef = useRef(false);

  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const total = minutes * 60_000;
    const warnAt = Math.max(total - 60_000, total * 0.8);
    const bump = () => {
      if (!warningRef.current) last.current = Date.now();
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'wheel', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= total) {
        clearInterval(iv);
        timeoutRef.current();
      } else if (idle >= warnAt) {
        warningRef.current = true;
        setWarning(true);
        setLeft(Math.ceil((total - idle) / 1000));
      }
    }, 1000);
    return () => {
      clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [minutes]);

  const stay = () => {
    warningRef.current = false;
    last.current = Date.now();
    setWarning(false);
  };

  return (
    <Modal
      open={warning}
      onClose={stay}
      size="sm"
      title="Sua sessão vai expirar"
      footer={
        <>
          <Button variant="ghost" onClick={() => timeoutRef.current()}>
            Sair agora
          </Button>
          <Button variant="primary" onClick={stay}>
            Continuar conectado
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <div className="size-14 rounded-full bg-warning-soft text-warning flex items-center justify-center">
          <Clock className="size-6" />
        </div>
        <div>
          <p className="text-sm text-muted">Por segurança, você será desconectado por inatividade em</p>
          <p className="text-3xl font-semibold num text-fg mt-1">{left}s</p>
        </div>
      </div>
    </Modal>
  );
}
