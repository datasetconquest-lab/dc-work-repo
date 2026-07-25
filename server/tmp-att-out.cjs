const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://datasetconquest_db_admin:DC-ML%4025@cluster0.dwnv0hm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

const OFF = (5 * 60 + 30) * 60000;
const CUTOFF = 570, EFFECTIVE = '2026-07-01';
const keyOf = d => new Date(d.getTime() + OFF).toISOString().slice(0, 10);
const istMin = d => { const z = new Date(d.getTime() + OFF); return z.getUTCHours() * 60 + z.getUTCMinutes(); };
function deriveStatus(i, o, lateAllowed, dateKey) {
  if (!i) return o ? 'partial' : 'absent';
  if (dateKey < EFFECTIVE) return o ? 'present' : 'partial';
  if (istMin(i) < CUTOFF) return o ? 'present' : 'partial';
  return lateAllowed ? 'late' : 'absent';
}
function dayOfWeek(key) { const [y, mo, d] = key.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }); }
const slim = r => r ? JSON.stringify({ in: r.in_time, out: r.out_time, status: r.status }) : '(no record)';

const DATE_KEY = keyOf(new Date());                       // today (IST)
const outTime = new Date(`${DATE_KEY}T19:28:20+05:30`);  // 7:28:20 PM IST

(async () => {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db('dc_teams');
    const u = await db.collection('users').findOne({ employee_id: 'DC006' });
    if (!u) { console.log('DC006 not found'); return; }
    const att = db.collection('attendance');
    const now = new Date();
    const before = await att.findOne({ user_id: u._id, date: DATE_KEY });
    const lateAllowed = Array.isArray(u.late_permission_dates) && u.late_permission_dates.includes(DATE_KEY);
    console.log(`Today: ${DATE_KEY} | Tarun M (DC006) | lateAllowed=${lateAllowed}`);
    console.log('BEFORE:', slim(before));
    const status = deriveStatus(before?.in_time ?? null, outTime, lateAllowed, DATE_KEY);
    await att.updateOne(
      { user_id: u._id, date: DATE_KEY },
      {
        $set: { employee_id: 'DC006', employee_name: u.full_name || u.email, day: dayOfWeek(DATE_KEY), out_time: outTime, status, updated_at: now },
        $setOnInsert: { user_id: u._id, date: DATE_KEY, in_time: null, created_at: now },
      },
      { upsert: true }
    );
    const after = await att.findOne({ user_id: u._id, date: DATE_KEY });
    console.log('AFTER: ', slim(after));
  } catch (e) { console.error('ERROR:', e.message); process.exitCode = 1; }
  finally { await client.close(); }
})();
