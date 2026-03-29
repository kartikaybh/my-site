// ============================================================================
// AGENTIC PROPOSAL ENGINE
// ============================================================================
// This serverless function is an AI AGENT — not a script.
// You give Claude tools and a goal. Claude decides what to do.
//
// Flow: Visitor completes intake chat → this function receives the conversation
//       → Claude writes a proposal, renders a PDF, emails it, and alerts you
//       → All autonomously, in 2-3 turns
//
// Tools: 3 core (render PDF, send email, alert owner)
//        + 1 optional (store lead in Supabase — enabled when env vars present)
//
// Works with: Express (local dev via server.js) and Vercel (production)
// ============================================================================

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// ── Tool definitions for Claude ─────────────────────────────────────────────
// These are the "hands" Claude can use. Claude decides WHEN and HOW to use them.

const CORE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'render_proposal_pdf',
      description: 'Renders a branded proposal PDF. Returns base64-encoded PDF data. Use the commercials array for the Investment section — it renders as a structured table.',
      parameters: {
        type: 'object',
        properties: {
          company_name: { type: 'string', description: 'The prospect company name' },
          contact_name: { type: 'string', description: 'The prospect contact name' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['heading', 'body'],
            },
            description: 'Proposal sections (Understanding, Approach, Engagement, Next Steps). Do NOT include Investment here — use commercials instead.',
          },
          commercials: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item: { type: 'string', description: 'Service or deliverable name' },
                scope: { type: 'string', description: 'What is included' },
                duration: { type: 'string', description: 'Timeline or frequency' },
                price: { type: 'string', description: 'Price or price range (e.g. "3-5L/month")' },
              },
              required: ['item', 'scope', 'price'],
            },
            description: 'Line items for the commercials/investment table. Each row is a service with scope, duration, and price.',
          },
        },
        required: ['company_name', 'contact_name', 'sections', 'commercials'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Sends an email to the prospect with optional PDF attachment.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body text (plain text)' },
          attach_pdf: { type: 'boolean', description: 'Whether to attach the proposal PDF' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'alert_owner',
      description: 'Sends a Telegram alert to the owner with lead summary and proposal PDF.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Alert message text including lead score (HIGH/MEDIUM/LOW)' },
        },
        required: ['message'],
      },
    },
  },
];

// Optional tool — only available if Supabase is configured (Power Up: Lead Storage)
const STORE_LEAD_TOOL = {
  type: 'function',
  function: {
    name: 'store_lead',
    description: 'Stores the lead in the CRM database with score and conversation data.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Contact name' },
        company: { type: 'string', description: 'Company name' },
        email: { type: 'string', description: 'Contact email' },
        industry: { type: 'string', description: 'Company industry' },
        challenge: { type: 'string', description: 'Their main challenge (1-2 sentences)' },
        budget: { type: 'string', description: 'Budget range mentioned' },
        score: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'Lead score based on triage rules' },
        status: { type: 'string', description: 'Lead status, e.g. proposal_sent' },
      },
      required: ['name', 'company', 'email', 'score', 'status'],
    },
  },
};

// Build tools list — Supabase tool is included only when configured
function getTools() {
  const tools = [...CORE_TOOLS];
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    tools.push(STORE_LEAD_TOOL);
  }
  return tools;
}

// ── PDF text sanitizer ──────────────────────────────────────────────────────
// pdf-lib standard fonts only support WinAnsi encoding (basic ASCII).
// AI-generated text WILL contain characters that crash PDF rendering.
// This function MUST run on ALL text before any drawText() call.

function sanitizeForPdf(text) {
  if (!text) return '';
  return text
    // Currency symbols → text equivalents
    .replace(/₹/g, 'INR ')
    .replace(/€/g, 'EUR ')
    .replace(/£/g, 'GBP ')
    // Dashes → hyphen
    .replace(/[\u2013\u2014\u2015]/g, '-')
    // Curly quotes → straight quotes
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2039\u203A]/g, "'")
    .replace(/[\u00AB\u00BB]/g, '"')
    // Ellipsis → three dots
    .replace(/\u2026/g, '...')
    // Special spaces → regular space
    .replace(/[\u00A0\u2002\u2003\u2007\u202F]/g, ' ')
    // Bullets and symbols → ASCII equivalents
    .replace(/[\u2022\u2023\u25E6\u2043]/g, '-')
    .replace(/\u2713/g, '[x]')
    .replace(/\u2717/g, '[ ]')
    .replace(/\u00D7/g, 'x')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    // Catch-all: remove anything outside printable ASCII + newlines/tabs
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

// ── Tool implementations ────────────────────────────────────────────────────

let proposalPdfBase64 = null; // Stored in memory for the email attachment step

async function renderProposalPdf({ company_name, contact_name, sections, commercials }) {
  // Sanitize ALL text before rendering
  company_name = sanitizeForPdf(company_name);
  contact_name = sanitizeForPdf(contact_name);
  sections = sections.map(s => ({
    heading: sanitizeForPdf(s.heading),
    body: sanitizeForPdf(s.body),
  }));
  if (commercials) {
    commercials = commercials.map(c => ({
      item: sanitizeForPdf(c.item),
      scope: sanitizeForPdf(c.scope),
      duration: sanitizeForPdf(c.duration || ''),
      price: sanitizeForPdf(c.price),
    }));
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Brand palette — matched to kartikay.greynium.com
  const navy     = rgb(0.102, 0.102, 0.18);   // #1A1A2E
  const orange   = rgb(1.0, 0.584, 0.0);      // #FF9500
  const cream    = rgb(1.0, 0.973, 0.953);     // #FFF8F3 page background
  const surface  = rgb(1.0, 0.945, 0.902);     // #FFF1E6 section tint
  const black    = rgb(0.1, 0.1, 0.1);
  const gray     = rgb(0.35, 0.35, 0.35);
  const lightGray = rgb(0.91, 0.91, 0.94);    // #E8E8F0 borders
  const white    = rgb(1, 1, 1);

  // ── Shared helpers ──
  const W = 612;
  const H = 792;
  const margin = 50;
  const contentW = W - margin * 2;

  function addPageWithChrome() {
    const pg = pdf.addPage([W, H]);
    // Cream background
    pg.drawRectangle({ x: 0, y: 0, width: W, height: H, color: cream });
    // Navy top bar
    pg.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: navy });
    // Name in top bar
    pg.drawText('Kartikay Bhardwaj', {
      x: margin, y: H - 28, size: 10, font: fontBold, color: white,
    });
    // Orange accent line under name
    pg.drawText('Greynium.com', {
      x: W - margin - font.widthOfTextAtSize('Greynium.com', 9), y: H - 27, size: 9, font, color: orange,
    });
    // Footer bar
    pg.drawRectangle({ x: 0, y: 0, width: W, height: 36, color: navy });
    pg.drawText('kartikay@greynium.com  |  greynium.com  |  linkedin.com/in/kartikay-bhardwaj', {
      x: margin, y: 13, size: 8, font, color: rgb(0.6, 0.6, 0.65),
    });
    return pg;
  }

  // ── Cover page ──
  const cover = pdf.addPage([W, H]);
  // Full navy background
  cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: navy });
  // Large orange accent block top-right
  cover.drawRectangle({ x: W - 180, y: H - 200, width: 180, height: 200, color: orange });
  // Small orange bar left
  cover.drawRectangle({ x: margin, y: 480, width: 60, height: 4, color: orange });
  // Name
  cover.drawText('KARTIKAY BHARDWAJ', {
    x: margin, y: 450, size: 14, font: fontBold, color: orange,
  });
  cover.drawText('Digital Media Strategist  |  Greynium.com', {
    x: margin, y: 430, size: 11, font, color: rgb(0.6, 0.6, 0.7),
  });
  // Proposal title
  cover.drawText('PROPOSAL', {
    x: margin, y: 340, size: 48, font: fontBold, color: white,
  });
  // Divider
  cover.drawRectangle({ x: margin, y: 320, width: 80, height: 3, color: orange });
  // Client info
  cover.drawText(`Prepared for ${contact_name}`, {
    x: margin, y: 290, size: 16, font, color: rgb(0.85, 0.85, 0.9),
  });
  cover.drawText(company_name, {
    x: margin, y: 268, size: 13, font, color: rgb(0.6, 0.6, 0.7),
  });
  cover.drawText(
    new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
    { x: margin, y: 240, size: 11, font, color: rgb(0.5, 0.5, 0.55) }
  );
  // Bottom orange strip
  cover.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: orange });

  // ── Content pages ──
  let page = addPageWithChrome();
  let y = H - 70;
  const maxWidth = contentW - 20;

  function ensureSpace(needed) {
    if (y < needed + 50) {
      page = addPageWithChrome();
      y = H - 70;
    }
  }

  function drawLine(text, options) {
    ensureSpace(20);
    page.drawText(text, { x: options.x || margin, y, ...options });
    y -= options.lineHeight || 18;
  }

  function drawWrappedText(text, options) {
    const paragraphs = text.split('\n');
    const textMaxW = options.maxWidth || maxWidth;
    const textX = options.x || margin;
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') { y -= 10; continue; }
      const words = paragraph.split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const w = font.widthOfTextAtSize(testLine, options.size || 11);
        if (w > textMaxW && line) {
          drawLine(line, { size: 11, font, color: black, x: textX, ...options });
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) drawLine(line, { size: 11, font, color: black, x: textX, ...options });
    }
  }

  // Render each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    ensureSpace(120);

    // Section number badge — orange circle
    const badgeX = margin;
    const badgeY = y + 4;
    page.drawCircle({ x: badgeX + 10, y: badgeY, size: 12, color: orange });
    page.drawText(String(i + 1), {
      x: badgeX + 7, y: badgeY - 5, size: 11, font: fontBold, color: white,
    });

    // Section heading
    page.drawText(section.heading, {
      x: margin + 30, y: y, size: 16, font: fontBold, color: navy,
    });
    y -= 10;

    // Orange underline
    page.drawRectangle({ x: margin + 30, y: y, width: 50, height: 2, color: orange });
    y -= 18;

    // Tinted background block for body
    const bodyStartY = y;
    // We'll draw the tint after measuring, so first render text
    const bodyStartPage = page;
    drawWrappedText(section.body, { x: margin + 14, maxWidth: maxWidth - 28 });
    y -= 8;

    // Draw a subtle left accent bar for the section body
    if (page === bodyStartPage) {
      const barHeight = bodyStartY - y;
      page.drawRectangle({
        x: margin + 2, y: y, width: 3, height: barHeight,
        color: surface,
      });
    }

    y -= 16;
  }

  // ── Commercials table ──
  if (commercials && commercials.length > 0) {
    ensureSpace(200);

    // Section heading
    page.drawCircle({ x: margin + 10, y: y + 4, size: 12, color: orange });
    page.drawText(String(sections.length + 1), {
      x: margin + 7, y: y - 1, size: 11, font: fontBold, color: white,
    });
    page.drawText('Investment', {
      x: margin + 30, y: y, size: 16, font: fontBold, color: navy,
    });
    y -= 10;
    page.drawRectangle({ x: margin + 30, y: y, width: 50, height: 2, color: orange });
    y -= 28;

    // Table layout
    const colX = [margin, margin + 140, margin + 300, margin + 410];
    const colW = [140, 160, 110, contentW - 410];
    const rowH = 28;
    const tableW = contentW;

    // Header row — navy background
    ensureSpace(rowH + 10);
    page.drawRectangle({ x: margin, y: y - 6, width: tableW, height: rowH, color: navy });
    const headers = ['Service', 'Scope', 'Duration', 'Price'];
    headers.forEach((h, idx) => {
      page.drawText(h, {
        x: colX[idx] + 8, y: y + 2, size: 9, font: fontBold, color: white,
      });
    });
    y -= rowH + 6;

    // Data rows — alternating backgrounds
    for (let r = 0; r < commercials.length; r++) {
      const row = commercials[r];
      const values = [row.item, row.scope, row.duration, row.price];

      // Measure row height — wrap long text
      const cellLines = values.map((val, idx) => {
        const words = (val || '-').split(' ');
        const lines = [];
        let line = '';
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (font.widthOfTextAtSize(test, 9) > colW[idx] - 16 && line) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        return lines;
      });
      const maxLines = Math.max(...cellLines.map(l => l.length));
      const thisRowH = Math.max(rowH, maxLines * 14 + 14);

      ensureSpace(thisRowH + 4);

      // Row background
      const rowBg = r % 2 === 0 ? surface : cream;
      page.drawRectangle({ x: margin, y: y - thisRowH + rowH - 6, width: tableW, height: thisRowH, color: rowBg });

      // Cell text
      cellLines.forEach((lines, idx) => {
        lines.forEach((ln, li) => {
          page.drawText(ln, {
            x: colX[idx] + 8, y: y + 2 - li * 14, size: 9, font: idx === 3 ? fontBold : font, color: idx === 3 ? orange : black,
          });
        });
      });

      // Row border
      page.drawRectangle({ x: margin, y: y - thisRowH + rowH - 6, width: tableW, height: 0.5, color: lightGray });
      y -= thisRowH;
    }

    // Table outer border
    const tableTopY = y + commercials.length * rowH + rowH + 6; // approximate
    page.drawRectangle({ x: margin, y: y, width: tableW, height: 0.5, color: navy });

    y -= 16;

    // "All pricing is custom" note
    ensureSpace(30);
    page.drawText('All pricing is indicative and tailored to scope. Final commercials confirmed after discussion.', {
      x: margin, y: y, size: 8, font, color: gray,
    });
    y -= 30;
  }

  const pdfBytes = await pdf.save();
  proposalPdfBase64 = Buffer.from(pdfBytes).toString('base64');
  return { success: true, pages: pdf.getPageCount(), size_kb: Math.round(pdfBytes.length / 1024) };
}

async function sendEmail({ to, subject, body, attach_pdf }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

  const payload = {
    from: 'Kartikay Bhardwaj <onboarding@resend.dev>',
    to,
    subject,
    text: body,
  };

  if (attach_pdf && proposalPdfBase64) {
    payload.attachments = [{
      filename: 'proposal.pdf',
      content: proposalPdfBase64,
    }];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return { success: false, error: `Resend API error: ${res.status}` };
  }

  const data = await res.json();
  return { success: true, email_id: data.id };
}

async function storeLead(leadData) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return { success: false, error: 'Supabase not configured' };

  // Fields match the leads table schema:
  // name, company, email, industry, challenge, budget, score, status
  // conversation_transcript and created_at are handled separately
  const row = {
    name: leadData.name || null,
    company: leadData.company || null,
    email: leadData.email || null,
    industry: leadData.industry || null,
    challenge: leadData.challenge || null,
    budget: leadData.budget || null,
    score: leadData.score || null,
    status: leadData.status || 'proposal_sent',
  };

  const res = await fetch(`${url}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase error:', err);
    return { success: false, error: `Supabase error: ${res.status}` };
  }

  return { success: true };
}

async function alertOwner({ message }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return { success: false, error: 'Telegram not configured' };

  // Send text alert
  const textRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });

  if (!textRes.ok) {
    const err = await textRes.text();
    console.error('Telegram error:', err);
    return { success: false, error: `Telegram error: ${textRes.status}` };
  }

  // Send proposal PDF if available
  if (proposalPdfBase64) {
    const pdfBuffer = Buffer.from(proposalPdfBase64, 'base64');
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', new Blob([pdfBuffer], { type: 'application/pdf' }), 'proposal.pdf');
    formData.append('caption', 'Proposal PDF attached');

    await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData,
    });
  }

  return { success: true };
}

// ── Tool dispatcher ─────────────────────────────────────────────────────────

async function executeTool(name, args) {
  switch (name) {
    case 'render_proposal_pdf': return renderProposalPdf(args);
    case 'send_email':          return sendEmail(args);
    case 'store_lead':          return storeLead(args);
    case 'alert_owner':         return alertOwner(args);
    default:                    return { error: `Unknown tool: ${name}` };
  }
}

// ── Agent system prompt ─────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `You are an AI agent acting on behalf of Kartikay Bhardwaj.

You have received intake data from a website visitor. Your job:
1. Write a personalised proposal in Kartikay's voice
2. Score the lead using the triage rules below
3. Use your tools to: render the proposal as a PDF, email it to the visitor, store the lead (if store_lead tool is available), and alert Kartikay on Telegram

## KARTIKAY'S IDENTITY & VOICE
Kartikay Bhardwaj is a digital media professional and entrepreneur based in India, age 32. He runs Greynium.com — a digital services agency — while leading sales at Verse Innovation, one of India's top digital media publishers. Over 9 years he has built verticals from 0 to 1 across sales and product.

He is a professional, experienced publisher — not a startup freelancer. He has deep understanding of government and political communication cycles, and 9 years navigating long procurement cycles, agency stakeholders, and compliance constraints.

Education: MBA from XLRI Jamshedpur, Product Management from ISB, B.A. Economics (Hons) from Delhi University (rank holder).

Voice rules — write exactly as Kartikay speaks:
- Short sentences for impact. A punchy one-liner after a long sentence is deliberate.
- Start sentences with "And" naturally. Use parenthetical asides for colour.
- Capitalise ONE word per proposal for emotional emphasis (e.g. REAL, FOUNDATION).
- Lead with the answer or the hook — no preamble, no filler.
- Anchor in real experience — "we've done this for government clients" not "we can help with that."
- Always use British English.
- Never use: "Best regards," passive voice, corporate speak (leverage/synergy/circle back), or over-hedging ("I think," "perhaps").
- Never overpromise or make guarantees. Be direct and warm — authoritative without being cold. Never salesy.

## KARTIKAY'S SERVICES
1. Digital Ads — performance-led paid advertising across digital platforms, built to convert
2. Content & Influencer Marketing — strategy, creation, and influencer campaigns
3. WhatsApp Marketing — direct, high-conversion messaging campaigns

Clients: State governments, national government bodies and PSUs, political campaigns, and corporates.
Engagement model: Both project-based and monthly retainers. Pricing is custom.

Proof points:
- Generated 10x sales for a corporate client
- Grew a political client's followers by 100x
- Over a decade of experience in digital media

## LEAD TRIAGE RULES

### HIGH — Drop everything.
All of the following:
- Client type: Government body, PSU, state government, or political campaign
- Service fit: Needs one or more core services (Digital Ads, Content & Influencer Marketing, WhatsApp Marketing)
- Budget signal: Mentions a budget above 5 lakhs/month OR describes a scope that implies it (state-wide campaign, multi-platform, sustained engagement)
- Engagement readiness: Has a specific brief, upcoming election/campaign window, or active procurement cycle — not just exploring
- Example: A state government communications department looking for a 3-month digital advertising and WhatsApp campaign ahead of a policy launch, budget 8-10 lakhs/month

### MEDIUM — Worth pursuing.
Any of the following:
- Client type is right but scope is unclear: Government/PSU/political client who hasn't defined budget or timeline yet but has a real challenge
- Corporate client with clear scope: A corporate wanting digital ads or influencer marketing with a defined objective and budget in the 2-5 lakhs/month range
- Retainer potential: Any client explicitly asking about monthly retainers across any of the three services
- Referral or repeat: Mentions being referred by an existing client or has worked with Kartikay before
- Example: A corporate brand wanting a 3-month influencer marketing campaign to drive sales, budget around 3 lakhs/month

### LOW — Do not prioritise.
Any of the following:
- Wrong client type: Startups, individual creators, small businesses, or freelancers
- No budget signal: Says "just exploring," "no budget yet," or describes something that sounds like a sub-1 lakh engagement
- Service mismatch: Needs services Kartikay doesn't offer (app development, PR, event management, SEO-only projects)
- Tyre-kickers: Wants a "free consultation," asks for pricing without any brief, or gives vague answers across all intake questions
- Example: A D2C startup wanting social media management for 50,000/month with no specific campaign objective

## PROPOSAL STRUCTURE
Write these sections (passed as the "sections" array):
1. Understanding Your Challenge — show you listened to their specific situation
2. Recommended Approach — what Kartikay would do (specific to their problem, anchored in real experience)
3. Proposed Engagement — which service(s), scope, timeline
4. Next Steps — what happens after they review (direct conversation with Kartikay)

Do NOT put Investment/pricing in sections. Instead, pass a "commercials" array with line items:
- Each item has: item (service name), scope (what is included), duration (timeline), price (indicative range like "3-5L/month")
- Break it down by service — one row per service or deliverable
- Pricing is always custom and indicative, never a fixed menu
- Give realistic ranges based on the budget they mentioned

## INSTRUCTIONS
- Write the proposal in Kartikay's voice — direct, personal, specific to their situation
- Score the lead using the triage rules (HIGH/MEDIUM/LOW)
- Call render_proposal_pdf with both sections AND commercials arrays
- Call send_email with a warm, short email and the PDF attached
- If the store_lead tool is available, call it with all lead data and score
- Call alert_owner with a summary: company, contact, challenge, score, and one line on why
- You decide the order. You can call multiple tools at once if they are independent.`;

// ── Main handler ────────────────────────────────────────────────────────────
// Works as both Express route (local dev) and Vercel serverless function

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { conversation, intakeData } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  if (!conversation && !intakeData) {
    return res.status(400).json({ error: 'conversation or intakeData required' });
  }

  // Reset PDF state for this request
  proposalPdfBase64 = null;

  // Build context from intake data or conversation transcript
  const intakeContext = intakeData
    ? `VISITOR INTAKE DATA:\n${JSON.stringify(intakeData, null, 2)}`
    : `CONVERSATION TRANSCRIPT:\n${conversation.map(m => `${m.role}: ${m.content}`).join('\n')}`;

  // Build tools list — store_lead only available if Supabase is configured
  const tools = getTools();
  const supabaseEnabled = tools.some(t => t.function?.name === 'store_lead');
  console.log(`Agent starting with ${tools.length} tools${supabaseEnabled ? ' (Supabase enabled)' : ''}`);

  let messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: `${intakeContext}\n\nPlease write a personalized proposal, score this lead, and use your tools to send everything.` },
  ];

  const results = { proposal: false, email: false, stored: false, alerted: false };

  // ── Agent loop — max 5 turns for safety ──
  for (let turn = 1; turn <= 5; turn++) {
    console.log(`Agent turn ${turn}...`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers?.host ? `https://${req.headers.host}` : 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        messages,
        tools,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Agent OpenRouter error:', err);
      return res.status(502).json({ error: 'Agent API call failed', details: err });
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      console.error('Agent: no choice in response');
      break;
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // No tool calls = agent is done thinking
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      console.log(`Agent turn ${turn}... Agent completed.`);
      break;
    }

    // Execute each tool call
    const toolNames = assistantMessage.tool_calls.map(tc => tc.function.name);
    console.log(`Agent turn ${turn}... Claude called ${assistantMessage.tool_calls.length} tool(s): ${toolNames.join(', ')}`);

    for (const toolCall of assistantMessage.tool_calls) {
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error(`Failed to parse tool args for ${toolCall.function.name}:`, e.message);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: 'Failed to parse arguments' }),
        });
        continue;
      }

      const result = await executeTool(toolCall.function.name, args);

      // Track what succeeded
      if (toolCall.function.name === 'render_proposal_pdf' && result.success) results.proposal = true;
      if (toolCall.function.name === 'send_email' && result.success) results.email = true;
      if (toolCall.function.name === 'store_lead' && result.success) results.stored = true;
      if (toolCall.function.name === 'alert_owner' && result.success) results.alerted = true;

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  console.log('Agent pipeline complete:', results);
  return res.json({ success: true, results });
};
