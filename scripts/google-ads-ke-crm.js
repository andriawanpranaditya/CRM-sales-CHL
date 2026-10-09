/**
 * Google Ads → CRM Sales CHL (kirim otomatis)
 * -------------------------------------------------------------
 * Pasang di SETIAP akun Google Ads (Bio District, Permai Indah, dst):
 *   Google Ads → Tools → Bulk actions → Scripts → (+) New script → tempel seluruh isi file ini
 *   → Authorize → Preview (cek log) → Save → Frequency: Daily (atau Hourly).
 *
 * Yang dikirim: performa harian 30 hari terakhir per campaign & ad group (spend, impresi, klik, konversi)
 * + status campaign. CRM mendaftarkan campaign baru sendiri (⚡) dengan project sesuai nama akun Google Ads.
 */

// 1) Alamat CRM — samakan dengan alamat yang dipakai membuka CRM di browser
var CRM_URL = 'https://crm-sales-chl.vercel.app/api/gads-push';
// 2) Kunci — samakan PERSIS dengan env GADS_PUSH_SECRET di Vercel
var KUNCI = 'GANTI_DENGAN_GADS_PUSH_SECRET';
// 3) Berapa hari ke belakang yang dikirim ulang (angka Google bisa berubah beberapa hari setelah tayang)
var HARI = 30;

function main() {
  var akun = AdsApp.currentAccount();
  var tz = akun.getTimeZone();
  var sampai = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var dari = Utilities.formatDate(new Date(Date.now() - (HARI - 1) * 86400000), tz, 'yyyy-MM-dd');
  var rentang = "segments.date BETWEEN '" + dari + "' AND '" + sampai + "'";

  // Status semua campaign
  var campaigns = [];
  var itC = AdsApp.search('SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign');
  while (itC.hasNext()) {
    var c = itC.next();
    campaigns.push({ id: String(c.campaign.id), nama: c.campaign.name, status: c.campaign.status, tipe: c.campaign.advertisingChannelType });
  }

  // Performa per ad group (Search, Display, Video, dll)
  var rows = [], punyaAdGroup = {};
  var itA = AdsApp.search('SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.cost_micros, ' +
    'metrics.impressions, metrics.clicks, metrics.conversions FROM ad_group WHERE ' + rentang + ' AND metrics.impressions > 0');
  while (itA.hasNext()) {
    var r = itA.next();
    punyaAdGroup[String(r.campaign.id)] = true;
    rows.push(baris(r, String(r.adGroup.id), r.adGroup.name));
  }
  // Campaign tanpa ad group (Performance Max, dll) diambil di level campaign
  var itP = AdsApp.search('SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, ' +
    'metrics.clicks, metrics.conversions FROM campaign WHERE ' + rentang + ' AND metrics.impressions > 0');
  while (itP.hasNext()) {
    var p = itP.next();
    if (!punyaAdGroup[String(p.campaign.id)]) rows.push(baris(p, '', ''));
  }

  var kiriman = {
    akun: { id: akun.getCustomerId(), nama: akun.getName() },
    dari: dari, sampai: sampai, campaigns: campaigns, rows: rows
  };
  var res = UrlFetchApp.fetch(CRM_URL, {
    method: 'post', contentType: 'application/json', headers: { 'x-crm-key': KUNCI },
    payload: JSON.stringify(kiriman), muteHttpExceptions: true
  });
  Logger.log('CRM menjawab ' + res.getResponseCode() + ': ' + res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('Gagal kirim ke CRM: ' + res.getContentText());
}

function baris(r, adgroupId, adgroup) {
  return {
    tgl: r.segments.date,
    campaign_id: String(r.campaign.id), campaign: r.campaign.name,
    adgroup_id: adgroupId, adgroup: adgroup,
    spend: Number(r.metrics.costMicros || 0) / 1e6,
    impresi: Number(r.metrics.impressions || 0),
    klik: Number(r.metrics.clicks || 0),
    hasil: Math.round(Number(r.metrics.conversions || 0))
  };
}
