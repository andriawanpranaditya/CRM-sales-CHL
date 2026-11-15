// Judul link terbuka (tampil di halaman & pratinjau saat dibagikan lewat WhatsApp)
export const namaProject = p => p === 'BIO DISTRICT' ? 'Bio District' : p === 'PERMAI INDAH' ? 'Permai Indah' : String(p || '');
export const judulAgent = p => `Agent Visitor ${namaProject(p)}`.trim();
export const judulOther = p => `Sales Channel ${namaProject(p)}`.trim();
