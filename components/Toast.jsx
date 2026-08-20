'use client';
import { useEffect, useState } from 'react';

let listener = null;
export function toast(msg) { listener && listener(msg); }

export default function Toast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => {
    listener = m => { setMsg(m); setShow(true); setTimeout(() => setShow(false), 2400); };
    return () => { listener = null; };
  }, []);
  return <div className={'toast' + (show ? ' show' : '')}>{msg}</div>;
}
