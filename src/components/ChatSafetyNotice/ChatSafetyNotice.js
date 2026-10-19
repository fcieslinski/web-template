import React from 'react';
import classNames from 'classnames';

import css from './ChatSafetyNotice.module.css';

const ShieldIcon = () => (
  <svg viewBox="0 0 20 20" className={css.icon} aria-hidden="true" focusable="false">
    <path
      d="M10 2l6 2.5v4.6c0 3.9-2.6 7.1-6 8.4-3.4-1.3-6-4.5-6-8.4V4.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M10 6.5v4.2M10 13.3v.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * Refume: warning shown in the chat.
 * - variant "incoming": under someone else's message (recipient's view)
 * - variant "outgoing": under the message box while typing (sender's view)
 *
 * @param {Object} props
 * @param {{ contact: boolean, payment: boolean, links: string[] }} props.risks
 */
const ChatSafetyNotice = props => {
  const { risks, variant = 'incoming', masked, className } = props;
  if (!risks?.any) return null;

  const lines = [];
  if (variant === 'outgoing') {
    if (risks.contact || risks.payment) {
      lines.push(
        'Kontaktowanie się i płatności poza Refume są niezgodne z regulaminem. Naruszenia mogą skutkować blokadą konta.'
      );
    }
    if (risks.contact) {
      lines.push('Numer telefonu i e-mail będą u odbiorcy zakryte.');
    }
    if (risks.links.length) {
      lines.push('Linki do innych stron będą u odbiorcy nieaktywne.');
    }
  } else {
    if (risks.payment) {
      lines.push(
        'Ta wiadomość dotyczy płatności poza Refume. Takie płatności nie są objęte Ochroną Kupującego. Płać wyłącznie przez „Kup teraz” w ofercie.'
      );
    }
    if (risks.contact || masked) {
      lines.push(
        'Ukryliśmy dane kontaktowe z tej wiadomości. Rozmawiaj i płać przez Refume, tylko wtedy działa Ochrona Kupującego.'
      );
    }
    if (risks.links.length) {
      lines.push(
        `Link do zewnętrznej strony (${risks.links.join(', ')}) jest nieaktywny. Nie podawaj tam danych karty, BLIK ani loginu. Refume nigdy nie prosi o to przez link.`
      );
    }
  }

  return (
    <div
      className={classNames(css.root, variant === 'outgoing' ? css.outgoing : css.incoming, className)}
      role={variant === 'incoming' ? 'note' : 'status'}
    >
      <ShieldIcon />
      <div className={css.lines}>
        {lines.map(line => (
          <p key={line} className={css.line}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
};

export default ChatSafetyNotice;
