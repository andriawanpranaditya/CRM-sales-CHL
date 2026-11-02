'use client';
import { useState } from 'react';

// Kolom kata sandi dengan tombol mata untuk menampilkan isinya.
// Dipakai di layar masuk, ganti kata sandi, dan pembuatan akun.
export default function PasswordInput({ value, onChange, placeholder, autoFocus, autoComplete, name }) {
  const [lihat, setLihat] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={lihat ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        name={name}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        style={{ paddingRight: 46, width: '100%' }}
      />
      <button
        type="button"
        onClick={() => setLihat(v => !v)}
        aria-label={lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        title={lihat ? 'Sembunyikan' : 'Tampilkan'}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          width: 34, height: 34, border: 'none', background: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>
        {lihat ? (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
