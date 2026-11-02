'use client';
import { Component } from 'react';

// Pagar galat: bila satu panel menabrak, hanya panel itu yang menampilkan pesan —
// halaman lain tetap dapat dipakai, dan pesannya bisa dilaporkan apa adanya.
export default class PagarGalat extends Component {
  constructor(p) { super(p); this.state = { galat: null }; }
  static getDerivedStateFromError(e) { return { galat: e }; }
  render() {
    if (!this.state.galat) return this.props.children;
    return (
      <div className="card" style={{ marginTop: 18, borderColor: '#EED3D1' }}>
        <h2>{this.props.nama || 'Bagian ini'} tidak dapat ditampilkan</h2>
        <div className="note" style={{ background: '#FBEDEC', borderColor: '#EED3D1', color: '#7A2822', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
          {String(this.state.galat && this.state.galat.message || this.state.galat)}
        </div>
        <div className="hint">Bagian lain tetap dapat dipakai. Sampaikan pesan di atas agar dapat diperbaiki.</div>
      </div>
    );
  }
}
