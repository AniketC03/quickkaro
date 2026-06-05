const $ = (id) => document.getElementById(id);

const escapeHtml = (value) => String(value || "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return url;
};

const showDownload = (target, blob, filename, label) => {
  const url = URL.createObjectURL(blob);
  target.innerHTML = `<a href="${url}" download="${filename}">${label}</a><br><small>${(blob.size / 1024).toFixed(1)} KB</small>`;
};

const parseLines = (text) => String(text || "")
  .split(/\n+/)
  .map((line) => line.trim())
  .filter(Boolean);

async function compressImage() {
  const file = $("imageInput").files[0];
  const result = $("imageResult");
  if (!file) {
    result.textContent = "Choose an image first.";
    return;
  }

  const targetBytes = Number($("imageTarget").value) * 1024;
  const maxWidth = Number($("imageWidth").value) || 1280;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  let width = Math.min(img.width, maxWidth);
  let height = Math.round(img.height * (width / img.width));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let blob;

  for (let scale = 1; scale >= .35; scale -= .1) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (let quality = .9; quality >= .28; quality -= .08) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= targetBytes) break;
    }
    if (blob && blob.size <= targetBytes) break;
  }

  URL.revokeObjectURL(img.src);
  if (!blob) {
    result.textContent = "Compression failed. Try another image.";
    return;
  }

  showDownload(result, blob, `quickkaro-${Date.now()}.jpg`, "Download compressed image");
  result.insertAdjacentHTML("beforeend", `<br><small>Original ${(file.size / 1024).toFixed(1)} KB to ${(blob.size / 1024).toFixed(1)} KB</small>`);
}

function parsePageRange(range, totalPages) {
  if (!range.trim()) return Array.from({ length: totalPages }, (_, index) => index);
  const pages = new Set();
  range.split(",").forEach((part) => {
    const clean = part.trim();
    if (!clean) return;
    const [startRaw, endRaw] = clean.split("-").map((n) => Number(n.trim()));
    const start = Math.max(1, startRaw || 1);
    const end = Math.min(totalPages, endRaw || start);
    for (let page = start; page <= end; page += 1) pages.add(page - 1);
  });
  return [...pages].sort((a, b) => a - b);
}

async function createPdf() {
  const files = [...$("pdfInput").files];
  const result = $("pdfResult");
  const action = $("pdfAction").value;

  if (!window.PDFLib) {
    result.textContent = "PDF library is still loading. Try again in a moment.";
    return;
  }
  if (!files.length) {
    result.textContent = "Choose at least one PDF.";
    return;
  }

  const output = await PDFLib.PDFDocument.create();

  for (const file of files) {
    const source = await PDFLib.PDFDocument.load(await file.arrayBuffer());
    const pages = action === "split"
      ? parsePageRange($("pdfRange").value, source.getPageCount())
      : source.getPageIndices();
    const copied = await output.copyPages(source, pages);
    copied.forEach((page) => output.addPage(page));
    if (action === "split") break;
  }

  const bytes = await output.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  showDownload(result, blob, action === "merge" ? "quickkaro-merged.pdf" : "quickkaro-pages.pdf", "Download PDF");
}

function generateResume() {
  const name = escapeHtml($("resumeName").value || "Your Name");
  const role = escapeHtml($("resumeRole").value || "Target Role");
  const contact = escapeHtml($("resumeContact").value || "email | phone | city");
  const skills = parseLines($("resumeSkills").value).join(", ") || "Add your strongest skills";
  const body = parseLines($("resumeBody").value)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  $("resumeResult").innerHTML = `
    <div class="preview-doc">
      <h3>${name}</h3>
      <p><strong>${role}</strong><br>${contact}</p>
      <h4>Profile</h4>
      <p>Motivated candidate with practical project experience, strong learning ability and interest in delivering reliable work.</p>
      <h4>Skills</h4>
      <p>${escapeHtml(skills)}</p>
      <h4>Education, Projects and Experience</h4>
      <ul>${body || "<li>Add education, projects, internships or achievements.</li>"}</ul>
      <button class="btn primary" onclick="window.print()">Print / Save PDF</button>
    </div>`;
}

function generateInvoice() {
  const currency = $("currency").value;
  const rows = parseLines($("invoiceItems").value).map((line) => {
    const [name = "Item", qty = "1", price = "0"] = line.split(",").map((part) => part.trim());
    const amount = (Number(qty) || 0) * (Number(price) || 0);
    return { name, qty: Number(qty) || 0, price: Number(price) || 0, amount };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.amount, 0);
  const tax = subtotal * ((Number($("taxRate").value) || 0) / 100);
  const total = subtotal + tax;
  const itemHtml = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.qty}</td>
      <td>${currency} ${row.price.toFixed(2)}</td>
      <td>${currency} ${row.amount.toFixed(2)}</td>
    </tr>`).join("");

  $("invoiceResult").innerHTML = `
    <div class="preview-doc">
      <h3>Invoice ${escapeHtml($("invoiceNo").value || "QK-001")}</h3>
      <p><strong>${escapeHtml($("bizName").value || "Your Business")}</strong><br>Bill to: ${escapeHtml($("clientName").value || "Client Name")}</p>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${itemHtml || "<tr><td>Service</td><td>1</td><td>0.00</td><td>0.00</td></tr>"}</tbody>
      </table>
      <h4>Totals</h4>
      <p>Subtotal: ${currency} ${subtotal.toFixed(2)}<br>Tax: ${currency} ${tax.toFixed(2)}<br><strong>Total: ${currency} ${total.toFixed(2)}</strong></p>
      <button class="btn primary" onclick="window.print()">Print / Save PDF</button>
    </div>`;
}

function generateYoutubeIdeas() {
  const topic = $("videoTopic").value.trim() || "your topic";
  const audience = $("videoAudience").value.trim() || "viewers";
  const safeTopic = escapeHtml(topic);
  const safeAudience = escapeHtml(audience);
  $("youtubeResult").innerHTML = `
    <strong>Titles</strong>
    <ol>
      <li>${safeTopic}: Complete Guide for ${safeAudience}</li>
      <li>I Tried ${safeTopic} So You Do Not Waste Time</li>
      <li>Best ${safeTopic} Tips Nobody Explains Clearly</li>
      <li>${safeTopic} Mistakes to Avoid in 2026</li>
      <li>How to Start with ${safeTopic} as a Beginner</li>
    </ol>
    <strong>Description</strong>
    <p>In this video, we cover ${safeTopic} in a simple way for ${safeAudience}. Watch till the end for practical tips, common mistakes and a quick checklist.</p>
    <strong>Tags</strong>
    <p>${safeTopic}, ${safeTopic} tips, ${safeAudience}, beginner guide, India</p>`;
}

function generateCaptions() {
  const topic = $("captionTopic").value.trim() || "today's moment";
  const tone = $("captionTone").value;
  const tagSeed = topic.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 4);
  const tags = [...new Set([...tagSeed.map((word) => `#${word}`), "#india", "#daily", "#growth"])].join(" ");
  $("captionResult").innerHTML = `
    <strong>${escapeHtml(tone)} captions</strong>
    <ol>
      <li>${escapeHtml(topic)}. Small step, big energy.</li>
      <li>Keeping it real with ${escapeHtml(topic)}.</li>
      <li>New day, new story: ${escapeHtml(topic)}.</li>
    </ol>
    <p>${escapeHtml(tags)}</p>`;
}

function calculateMarks() {
  const lines = parseLines($("marksInput").value);
  let percentValues = [];
  let cgpaValues = [];

  lines.forEach((line) => {
    const cgpa = line.match(/([\d.]+)\s*cgpa/i);
    if (cgpa) {
      cgpaValues.push(Number(cgpa[1]));
      percentValues.push(Number(cgpa[1]) * 9.5);
      return;
    }
    const fraction = line.match(/([\d.]+)\s*\/\s*([\d.]+)/);
    if (fraction) {
      percentValues.push((Number(fraction[1]) / Number(fraction[2])) * 100);
      return;
    }
    const raw = Number(line.replace("%", ""));
    if (!Number.isNaN(raw)) percentValues.push(raw);
  });

  if (!percentValues.length) {
    $("marksResult").textContent = "Use formats like 78/100, 82%, or 9.2 CGPA.";
    return;
  }

  const average = percentValues.reduce((sum, value) => sum + value, 0) / percentValues.length;
  const cgpaAverage = average / 9.5;
  $("marksResult").innerHTML = `<strong>${average.toFixed(2)}%</strong><br>Approx CGPA: ${cgpaAverage.toFixed(2)}<br><small>${percentValues.length} entries calculated.</small>`;
}

function countWords() {
  const text = $("wordInput").value.trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const chars = text.length;
  const sentences = text ? text.split(/[.!?]+/).filter((part) => part.trim()).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 220));
  $("wordResult").innerHTML = `
    <span><strong>${words}</strong> words</span>
    <span><strong>${chars}</strong> characters</span>
    <span><strong>${sentences}</strong> sentences</span>
    <span><strong>${minutes}</strong> min read</span>`;
}

function calculateAge() {
  const value = $("dobInput").value;
  if (!value) {
    $("ageResult").textContent = "Select a birth date.";
    return;
  }
  const dob = new Date(`${value}T00:00:00`);
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  let days = today.getDate() - dob.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  $("ageResult").innerHTML = `<strong>${years} years</strong>, ${months} months, ${days} days`;
}

async function generateQr() {
  const text = $("qrText").value.trim();
  if (!text) {
    $("qrResult").textContent = "Enter text or a link.";
    return;
  }
  if (!window.QRCode) {
    $("qrResult").textContent = "QR library is still loading. Try again in a moment.";
    return;
  }
  await QRCode.toCanvas($("qrCanvas"), text, {
    width: 180,
    margin: 2,
    color: { dark: "#18212f", light: "#ffffff" }
  });
  $("qrResult").innerHTML = `<button class="btn" id="downloadQrBtn">Download PNG</button>`;
  $("downloadQrBtn").addEventListener("click", () => {
    $("qrCanvas").toBlob((blob) => downloadBlob(blob, "quickkaro-qr.png"));
  });
}

const on = (id, event, handler) => {
  const element = $(id);
  if (element) element.addEventListener(event, handler);
};

on("compressImageBtn", "click", compressImage);
on("pdfBtn", "click", createPdf);
on("resumeBtn", "click", generateResume);
on("invoiceBtn", "click", generateInvoice);
on("youtubeBtn", "click", generateYoutubeIdeas);
on("captionBtn", "click", generateCaptions);
on("marksBtn", "click", calculateMarks);
on("wordInput", "input", countWords);
on("ageBtn", "click", calculateAge);
on("qrBtn", "click", generateQr);
