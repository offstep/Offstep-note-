// OFFSTEP NOTES · accès à Supabase (lecture + RPC). Seul lien avec OFFSTEP : la même base.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const must = ({ data, error }) => { if (error) throw error; return data; };

export const getSession = async () => (await sb.auth.getSession()).data.session;
export const signInGoogle = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
export const signInPassword = async (email, password) => must(await sb.auth.signInWithPassword({ email, password }));
export const signOut = () => sb.auth.signOut();

// Relie le compte à son profil puis le lit (la lecture est filtrée sur le compte connecté)
export async function loadProfile(uid) {
  must(await sb.rpc('claim_profile'));
  return must(await sb.from('profiles').select('id,role,rights,boutique_id,name,active').eq('auth_user_id', uid).maybeSingle());
}
export const loadBoutiques = async () => must(await sb.from('boutiques').select('id,name').order('id'));

async function fetchAll(build) {
  const rows = []; for (let from = 0; ; from += 1000) { const d = must(await build().range(from, from + 999)); rows.push(...d); if (d.length < 1000) break; } return rows;
}
// Variantes + modèles + stock des 3 boutiques → liste à plat prête pour les suggestions
export async function loadCatalog() {
  const [vs, ms, st] = await Promise.all([
    fetchAll(() => sb.from('variants').select('id,model_id,color,size').order('id')),
    fetchAll(() => sb.from('models').select('id,name,ref,price_fcfa').order('id')),
    fetchAll(() => sb.from('stock').select('variant_id,boutique_id,qty').order('variant_id')),
  ]);
  return buildCatalog(vs, ms, st);
}
export function buildCatalog(vs, ms, st) {
  const mm = new Map(ms.map((m) => [m.id, m])); const stock = new Map();
  for (const r of st) { if (!stock.has(r.variant_id)) stock.set(r.variant_id, {}); stock.get(r.variant_id)[r.boutique_id] = r.qty; }
  return vs.filter((v) => mm.has(v.model_id)).map((v) => { const m = mm.get(v.model_id); return { id: v.id, model_id: v.model_id, name: m.name, ref: m.ref || '', color: v.color, size: v.size, price: m.price_fcfa || 0, stock: stock.get(v.id) || {} }; });
}
export const loadStockRows = async () => fetchAll(() => sb.from('stock').select('variant_id,boutique_id,qty').order('variant_id'));
export const loadEntries = async (b, day) => must(await sb.from('notes_entries').select('*').eq('boutique_id', b).eq('day', day).order('id'));
export const loadDays = async (b, from) => must(await sb.rpc('notes_days', { p_boutique: b, p_from: from }));
export async function loadSales(b, since) {
  const sales = await fetchAll(() => sb.from('notes_entries').select('*').eq('boutique_id', b).eq('kind', 'sale').gte('day', since).order('id'));
  const rev = await fetchAll(() => sb.from('notes_entries').select('reverses_entry_id').eq('boutique_id', b).gte('day', since).not('reverses_entry_id', 'is', null).order('id'));
  return { sales, reversed: rev.map((r) => r.reverses_entry_id) };
}
export const loadMonthEntries = async (b, from, to) => fetchAll(() => sb.from('notes_entries').select('*').eq('boutique_id', b).gte('day', from).lt('day', to).order('id'));
export async function monthSummary(b, month) { const { data, error } = await sb.rpc('notes_month_summary', { p_boutique: b, p_month: month + '-01' }); return error ? null : data; }
// Envoi d'un lot de lignes : lève une erreur si le réseau ou la session échoue (les lignes restent alors en attente)
export async function syncLines(lines) { return must(await sb.rpc('notes_sync', { p_lines: lines })); }

export function subscribeLive({ onStock, onEntries }) {
  const ch = sb.channel('notes-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, () => onStock?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes_entries' }, () => onEntries?.())
    .subscribe();
  return () => sb.removeChannel(ch);
}
