// Confere senhas NO SERVIDOR (antes era feito no navegador, onde qualquer um podia ver).
import { serverSupabase } from '../../lib/serverSupabase';
import { createToken } from '../../lib/authToken';

// Senha mestra do dono do SaaS: defina MASTER_PASSWORD nas variáveis de ambiente da Vercel.
const MASTER = (process.env.MASTER_PASSWORD || '').trim();

// Proteção simples contra tentativa e erro (por instância do servidor)
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  attempts.set(key, list);
  return list.length >= 15;
}
function registerFail(key) {
  const list = attempts.get(key) || [];
  list.push(Date.now());
  attempts.set(key, list);
}

const same = (a, b) => a !== undefined && a !== null && String(a).trim() !== '' && String(a).trim() === String(b || '').trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { slug, scope, password, profId } = req.body || {};
  const cleanSlug = String(slug || '').toLowerCase().trim();
  const pass = String(password || '').trim();
  if (!cleanSlug || !scope) return res.status(400).json({ ok: false, error: 'Dados incompletos' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'ip';
  const key = `${ip}|${cleanSlug}`;
  if (tooManyAttempts(key)) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde 10 minutos.' });

  try {
    const { data: t } = await serverSupabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();
    if (!t) return res.status(200).json({ ok: false, error: 'Estabelecimento não encontrado' });

    const isMaster = MASTER !== '' && pass === MASTER;
    const isAdmin = same(t.admin_password, pass);
    const isFin = same(t.financial_password, pass);
    const hasFin = !!(t.financial_password && String(t.financial_password).trim() !== '');

    let profs = [];
    if (['agenda', 'prof_fin', 'agenda_prices'].includes(scope)) {
      const { data } = await serverSupabase.from('professionals').select('id, pin, active').eq('tenant_id', t.id);
      profs = data || [];
    }
    const isAnyProfPin = profs.some((p) => p.active !== false && same(p.pin, pass));

    let ok = false;
    let level = null;

    switch (scope) {
      case 'admin': // painel admin e portal (mesma regra de antes)
        ok = isMaster || isAdmin || isFin;
        level = 'admin';
        break;
      case 'agenda': // agenda: senha do admin, financeira ou PIN de qualquer profissional
        ok = isMaster || isAdmin || isFin || isAnyProfPin;
        level = (isMaster || isAdmin || isFin) ? 'admin' : 'agenda';
        break;
      case 'financial': // relatório financeiro geral (mesma regra de antes)
        ok = isMaster || (hasFin ? isFin : isAdmin);
        break;
      case 'agenda_prices':
        ok = isMaster || isAdmin || isFin || isAnyProfPin;
        break;
      case 'change_fin_pass': // confirmar senha financeira atual para trocá-la
        ok = isMaster || isFin;
        break;
      case 'prof_fin': { // extrato individual do profissional
        const prof = profs.find((p) => String(p.id) === String(profId));
        if (!prof) break;
        const profHasPin = !!(prof.pin && String(prof.pin).trim() !== '');
        // Mantém o comportamento antigo: profissional sem PIN cadastrado libera direto.
        ok = !profHasPin || same(prof.pin, pass) || isMaster;
        break;
      }
      default:
        return res.status(400).json({ ok: false, error: 'Escopo inválido' });
    }

    if (!ok) {
      registerFail(key);
      return res.status(200).json({ ok: false, error: 'Senha incorreta' });
    }

    const out = { ok: true, level, tenant_id: t.id, slug: t.slug };
    if (level) out.token = createToken(cleanSlug, level);
    return res.status(200).json(out);
  } catch (e) {
    console.error('login:', e);
    return res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
}
