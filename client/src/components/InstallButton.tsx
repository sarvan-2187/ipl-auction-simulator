import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePwa } from '../lib/pwa';

const Share = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
);
const Plus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></svg>
);

export default function InstallButton({ className = '' }: { className?: string }) {
  const pwa = usePwa();
  const [help, setHelp] = useState(false);
  if (!pwa.available) return null;
  const go = async () => { if ((await pwa.install()) === 'ios') setHelp(true); };
  return (
    <>
      <button type="button" className={`install-pill ${className}`} onClick={go}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5M5 21h14" /></svg>
        Install app
      </button>
      <AnimatePresence>
        {help && (
          <motion.div className="confirm-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHelp(false)}>
            <motion.div className="confirm-box install-help" role="dialog" aria-label="Install The Dugout" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
              <h3>Add The Dugout to your Home Screen</h3>
              <ol>
                <li><span className="ih-ic"><Share /></span><span>Tap <b>Share</b> in Safari's toolbar</span></li>
                <li><span className="ih-ic"><Plus /></span><span>Choose <b>Add to Home Screen</b></span></li>
                <li><span className="ih-ic">✓</span><span>Tap <b>Add</b>. It opens full screen, like an app</span></li>
              </ol>
              <div className="confirm-actions"><button className="btn btn-gold" autoFocus onClick={() => setHelp(false)}>Got it</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
