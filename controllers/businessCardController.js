const crypto = require('crypto');
const BusinessCard = require('../models/BusinessCard');
const Business = require('../models/Business');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { temporaryBusinessMediaUrl } = require('../services/cloudinaryBusinessMediaService');

const clean = (value) => `${value ?? ''}`.trim();

const safeColor = (value, fallback = '#2563EB') => {
  const text = clean(value);
  return /^#[0-9A-F]{6}$/i.test(text) ? text.toUpperCase() : fallback;
};

const safeUrl = (value) => {
  const text = clean(value);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
};

const normalizeWhatsapp = (value) => clean(value).replace(/[^\d+]/g, '');

const slugBase = (name) => clean(name)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 45) || 'workpilot-business';

const newSlug = async (businessName, currentSlug = '') => {
  const base = slugBase(businessName);
  let slug = currentSlug || `${base}-${crypto.randomBytes(3).toString('hex')}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await BusinessCard.findOne({ slug }).select('_id').lean();
    if (!existing) return slug;
    slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }

  throw new Error('Unable to create a unique business card link');
};

const getBusiness = (userId) => Business.findOne({ ownerId: userId });

const cardPayload = (card, business) => ({
  id: card._id,
  slug: card.slug,
  template: card.template,
  primaryColor: card.primaryColor,
  tagline: card.tagline,
  website: card.website,
  whatsapp: card.whatsapp,
  instagram: card.instagram,
  linkedin: card.linkedin,
  services: card.services,
  publicEnabled: card.publicEnabled,
  viewCount: card.viewCount,
  leadCount: card.leadCount,
  lastViewedAt: card.lastViewedAt,
  business: {
    businessName: business.businessName,
    businessType: business.businessType,
    phone: business.phone,
    email: business.email,
    addressLine1: business.addressLine1,
    addressLine2: business.addressLine2,
    city: business.city,
    state: business.state,
    pincode: business.pincode,
    hasLogo: Boolean(business.logo?.publicId),
  },
});

const getOrCreateCard = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    const user = await User.findById(req.userId).select('name email phone').lean();
    if (!business || !user) return res.status(404).json({ message: 'Business profile not found' });

    let card = await BusinessCard.findOne({ businessId: business._id });
    if (!card) {
      card = await BusinessCard.create({
        businessId: business._id,
        slug: await newSlug(business.businessName),
      });
    }

    return res.json({
      card: cardPayload(card, business),
      owner: {
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('Get business card error:', error);
    return res.status(500).json({ message: 'Unable to load business card' });
  }
};

const updateCard = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business profile not found' });

    const allowedTemplates = ['modern', 'classic', 'minimal', 'dark'];
    const template = allowedTemplates.includes(clean(req.body.template))
      ? clean(req.body.template)
      : 'modern';

    const services = Array.isArray(req.body.services)
      ? req.body.services.map(clean).filter(Boolean).slice(0, 8)
      : clean(req.body.services)
          .split(',')
          .map(clean)
          .filter(Boolean)
          .slice(0, 8);

    let card = await BusinessCard.findOne({ businessId: business._id });
    if (!card) {
      card = new BusinessCard({
        businessId: business._id,
        slug: await newSlug(business.businessName),
      });
    }

    card.template = template;
    card.primaryColor = safeColor(req.body.primaryColor);
    card.tagline = clean(req.body.tagline).slice(0, 160);
    card.website = safeUrl(req.body.website).slice(0, 250);
    card.whatsapp = normalizeWhatsapp(req.body.whatsapp).slice(0, 30);
    card.instagram = clean(req.body.instagram).slice(0, 120);
    card.linkedin = safeUrl(req.body.linkedin).slice(0, 250);
    card.services = services;
    card.publicEnabled = req.body.publicEnabled !== false;

    if (req.body.changeSlug === true) {
      card.slug = await newSlug(business.businessName);
    }

    await card.save();

    return res.json({
      message: 'Business card saved successfully',
      card: cardPayload(card, business),
    });
  } catch (error) {
    console.error('Update business card error:', error);
    return res.status(500).json({ message: 'Unable to save business card' });
  }
};

const getStats = async (req, res) => {
  try {
    const business = await getBusiness(req.userId);
    if (!business) return res.status(404).json({ message: 'Business profile not found' });
    const card = await BusinessCard.findOne({ businessId: business._id }).lean();
    return res.json({
      views: card?.viewCount || 0,
      leads: card?.leadCount || 0,
      lastViewedAt: card?.lastViewedAt || null,
    });
  } catch (error) {
    console.error('Business card stats error:', error);
    return res.status(500).json({ message: 'Unable to load business card analytics' });
  }
};

const captureLead = async (req, res) => {
  try {
    const card = await BusinessCard.findOne({ slug: clean(req.params.slug), publicEnabled: true });
    if (!card) return res.status(404).json({ message: 'Business card not found' });

    const business = await Business.findById(card.businessId).lean();
    if (!business) return res.status(404).json({ message: 'Business not found' });

    const name = clean(req.body.name).slice(0, 100);
    const phone = clean(req.body.phone).slice(0, 30);
    const email = clean(req.body.email).slice(0, 160).toLowerCase();
    const message = clean(req.body.message).slice(0, 500);

    if (name.length < 2 || phone.length < 7) {
      return res.status(400).json({ message: 'Name and a valid phone number are required' });
    }

    let customer = await Customer.findOne({ businessId: business._id, phone, isActive: true });
    const leadNote = `SmartCard enquiry${message ? `: ${message}` : ''}`;

    if (!customer) {
      customer = await Customer.create({
        businessId: business._id,
        name,
        phone,
        email,
        address: '',
        city: '',
        customerType: 'Regular',
        notes: leadNote,
        creditLimit: 0,
        outstandingBalance: 0,
        totalPurchases: 0,
        purchaseCount: 0,
        isActive: true,
      });
    } else if (message) {
      customer.notes = `${customer.notes ? `${customer.notes}\n` : ''}${leadNote}`.slice(-3000);
      if (!customer.email && email) customer.email = email;
      await customer.save();
    }

    await BusinessCard.updateOne(
      { _id: card._id },
      { $inc: { leadCount: 1 } },
    );

    return res.status(201).json({
      message: 'Thanks! Your enquiry was sent to the business.',
      customerId: customer._id,
    });
  } catch (error) {
    console.error('Business card lead error:', error);
    return res.status(500).json({ message: 'Unable to submit enquiry' });
  }
};

const renderPublicCard = async (req, res) => {
  try {
    const slug = clean(req.params.slug).toLowerCase();
    const card = await BusinessCard.findOne({ slug, publicEnabled: true }).lean();
    if (!card) return res.status(404).send(publicErrorPage('Business card not found'));

    const [business, user] = await Promise.all([
      Business.findById(card.businessId).lean(),
      Business.findById(card.businessId).select('ownerId').lean().then((b) => b ? User.findById(b.ownerId).select('name email phone').lean() : null),
    ]);

    if (!business || !user) return res.status(404).send(publicErrorPage('Business profile not found'));

    BusinessCard.updateOne(
      { _id: card._id },
      { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } },
    ).catch((error) => console.error('Business card view tracking error:', error));

    let logoUrl = '';
    if (business.logo?.publicId && business.logo?.format) {
      try {
        logoUrl = temporaryBusinessMediaUrl(business.logo);
      } catch (_) {
        logoUrl = '';
      }
    }

    const fullAddress = [business.addressLine1, business.addressLine2, business.city, business.state, business.pincode]
      .map(clean)
      .filter(Boolean)
      .join(', ');
    const servicesHtml = card.services.length
      ? `<div class="section"><div class="section-title">Services</div><div class="chips">${card.services.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div></div>`
      : '';

    const theme = card.template === 'dark'
      ? { bg: '#0B1220', surface: '#111827', text: '#F8FAFC', muted: '#CBD5E1', border: '#334155' }
      : { bg: '#F6F8FC', surface: '#FFFFFF', text: '#111827', muted: '#64748B', border: '#E2E8F0' };

    const whatsapp = normalizeWhatsapp(card.whatsapp || business.phone);
    const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/^\+/, '')}` : '';
    const phoneHref = business.phone ? `tel:${encodeURIComponent(business.phone)}` : '';
    const emailHref = business.email ? `mailto:${encodeURIComponent(business.email)}` : (user.email ? `mailto:${encodeURIComponent(user.email)}` : '');

    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCard(user.name || business.businessName)}`,
      `ORG:${escapeVCard(business.businessName)}`,
      business.phone ? `TEL;TYPE=WORK,VOICE:${escapeVCard(business.phone)}` : '',
      (business.email || user.email) ? `EMAIL;TYPE=WORK:${escapeVCard(business.email || user.email)}` : '',
      fullAddress ? `ADR;TYPE=WORK:;;${escapeVCard(fullAddress)};;;;` : '',
      'END:VCARD',
    ].filter(Boolean).join('\\r\\n');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${escapeHtml(card.primaryColor)}">
<title>${escapeHtml(business.businessName)} · WorkPilot SmartCard</title>
<style>
:root{--primary:${escapeHtml(card.primaryColor)};--bg:${theme.bg};--surface:${theme.surface};--text:${theme.text};--muted:${theme.muted};--border:${theme.border}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{text-decoration:none;color:inherit}
.wrap{min-height:100vh;padding:28px 16px 42px}.card{max-width:560px;margin:0 auto;background:var(--surface);border:1px solid var(--border);border-radius:28px;overflow:hidden;box-shadow:0 20px 55px rgba(15,23,42,.10)}
.hero{padding:28px 24px 30px;background:linear-gradient(135deg,var(--primary),#111827);color:#fff}.minimal .hero{background:var(--surface);color:var(--text);border-bottom:1px solid var(--border)}
.logo{width:76px;height:76px;border-radius:22px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:18px;border:1px solid rgba(255,255,255,.2)}.minimal .logo{background:#F1F5F9;border-color:var(--border)}.logo img{width:100%;height:100%;object-fit:cover}.logo span{font-size:28px;font-weight:900}
h1{font-size:28px;line-height:1.08;margin:0 0 8px}.type{font-size:13px;font-weight:700;opacity:.82}.tagline{margin:14px 0 0;font-size:14px;line-height:1.55;opacity:.92}
.body{padding:22px 24px}.contact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.action{padding:13px 14px;border-radius:16px;border:1px solid var(--border);background:transparent;font-weight:800;font-size:13px;display:flex;align-items:center;gap:9px}.action.primary{background:var(--primary);color:#fff;border-color:var(--primary)}
.section{margin-top:24px}.section-title{text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--muted);font-weight:900;margin-bottom:10px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:9px 11px;background:color-mix(in srgb,var(--primary) 10%,transparent);border:1px solid color-mix(in srgb,var(--primary) 20%,transparent);color:var(--text);border-radius:999px;font-size:12px;font-weight:750}
.info{display:grid;gap:10px}.info-row{display:flex;gap:10px;font-size:13px;color:var(--muted);line-height:1.45}.info-row b{color:var(--text);display:block}.footer{padding:18px 24px;border-top:1px solid var(--border);text-align:center;color:var(--muted);font-size:11px}.brand{font-weight:900;color:var(--primary)}
.form{margin-top:24px;padding:18px;border:1px solid var(--border);border-radius:20px}.form h2{font-size:18px;margin:0 0 4px}.form p{font-size:12px;color:var(--muted);margin:0 0 14px}.input{width:100%;padding:12px 13px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--text);margin-top:8px;outline:none}.textarea{min-height:92px;resize:vertical}.submit{width:100%;border:0;border-radius:13px;background:var(--primary);color:#fff;padding:13px;font-weight:900;margin-top:10px}.toast{display:none;margin-top:10px;padding:10px 12px;border-radius:12px;background:#ECFDF5;color:#047857;font-size:12px;font-weight:800}.socials{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.social{padding:8px 10px;border-radius:999px;background:rgba(100,116,139,.10);font-size:11px;font-weight:800}
@media(max-width:420px){.contact-grid{grid-template-columns:1fr}.wrap{padding-left:10px;padding-right:10px}}
</style>
</head>
<body>
<div class="wrap"><div class="card ${card.template === 'minimal' ? 'minimal' : ''}">
<section class="hero">
<div class="logo">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Business logo">` : `<span>${escapeHtml((business.businessName || 'W').trim().slice(0,1).toUpperCase())}</span>`}</div>
<h1>${escapeHtml(business.businessName)}</h1>
<div class="type">${escapeHtml(business.businessType || 'Business')}</div>
${card.tagline ? `<div class="tagline">${escapeHtml(card.tagline)}</div>` : ''}
</section>
<div class="body">
<div class="contact-grid">
${phoneHref ? `<a class="action primary" href="${escapeHtml(phoneHref)}">Call</a>` : ''}
${whatsappHref ? `<a class="action" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
${emailHref ? `<a class="action" href="${escapeHtml(emailHref)}">Email</a>` : ''}
<a class="action" href="#enquiry">Send enquiry</a>
</div>
${servicesHtml}
<div class="section info">
${user.name ? `<div class="info-row"><span>👤</span><div><b>${escapeHtml(user.name)}</b>Owner / Contact</div></div>` : ''}
${business.phone ? `<div class="info-row"><span>📞</span><div><b>${escapeHtml(business.phone)}</b>Phone</div></div>` : ''}
${business.email || user.email ? `<div class="info-row"><span>✉️</span><div><b>${escapeHtml(business.email || user.email)}</b>Email</div></div>` : ''}
${fullAddress ? `<div class="info-row"><span>📍</span><div><b>${escapeHtml(fullAddress)}</b>Location</div></div>` : ''}
</div>
${card.website || card.instagram || card.linkedin ? `<div class="socials">${card.website ? `<a class="social" href="${escapeHtml(card.website)}" target="_blank" rel="noopener">Website</a>` : ''}${card.instagram ? `<a class="social" href="${escapeHtml(card.instagram.startsWith('http') ? card.instagram : `https://instagram.com/${card.instagram.replace(/^@/,'')}`)}" target="_blank" rel="noopener">Instagram</a>` : ''}${card.linkedin ? `<a class="social" href="${escapeHtml(card.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}</div>` : ''}
<div class="form" id="enquiry">
<h2>Connect with ${escapeHtml(business.businessName)}</h2><p>Send your details and the business can follow up from WorkPilot.</p>
<form id="leadForm"><input class="input" name="name" placeholder="Your name" required minlength="2" maxlength="100"><input class="input" name="phone" placeholder="Phone number" required minlength="7" maxlength="30"><input class="input" type="email" name="email" placeholder="Email (optional)" maxlength="160"><textarea class="input textarea" name="message" placeholder="What are you interested in?" maxlength="500"></textarea><button class="submit" type="submit">Send enquiry</button><div class="toast" id="toast"></div></form>
</div>
</div>
<div class="footer">Created with <span class="brand">WorkPilot SmartCard</span> · Save this contact directly to your phone.</div>
</div></div>
<script>
const slug=${JSON.stringify(slug)};
const vcard=${JSON.stringify(vcard).replace(/</g,'\\u003c')};
const form=document.getElementById('leadForm');const toast=document.getElementById('toast');
form.addEventListener('submit',async(e)=>{e.preventDefault();const fd=new FormData(form);const body=Object.fromEntries(fd.entries());const btn=form.querySelector('button');btn.disabled=true;btn.textContent='Sending…';try{const r=await fetch('/api/business-card/public/'+encodeURIComponent(slug)+'/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.message||'Unable to submit');toast.textContent=d.message||'Enquiry sent successfully';toast.style.display='block';form.reset()}catch(err){toast.textContent=err.message||'Unable to submit';toast.style.display='block';toast.style.background='#FEF2F2';toast.style.color='#B91C1C'}finally{btn.disabled=false;btn.textContent='Send enquiry'}});
function downloadVCard(){const blob=new Blob([vcard],{type:'text/vcard'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='workpilot-contact.vcf';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
const save=document.createElement('button');save.className='action';save.textContent='Save contact';save.style.marginTop='10px';save.onclick=downloadVCard;document.querySelector('.contact-grid').after(save);
</script>
</body></html>`;

    return res.type('html').send(html);
  } catch (error) {
    console.error('Render business card error:', error);
    return res.status(500).send(publicErrorPage('Unable to load this business card'));
  }
};

const publicErrorPage = (message) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorkPilot</title></head><body style="margin:0;background:#F7F9FC;font-family:system-ui;padding:40px;color:#111827"><div style="max-width:520px;margin:auto;background:white;border:1px solid #E5E7EB;border-radius:20px;padding:28px;text-align:center"><h2>WorkPilot SmartCard</h2><p>${escapeHtml(message)}</p></div></body></html>`;

const escapeHtml = (value) => `${value ?? ''}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const escapeVCard = (value) => `${value ?? ''}`
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

module.exports = {
  getOrCreateCard,
  updateCard,
  getStats,
  captureLead,
  renderPublicCard,
};
