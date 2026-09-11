const SUPABASE_URL = "https://ayalafmqetfunliexrng.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5YWxhZm1xZXRmdW5saWV4cm5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDM3MjMsImV4cCI6MjA5NzgxOTcyM30.hbBHLllj5eJLFSkK-CIb32Zxu1a4oitTPqZ-81fMg-U"
const BUCKET_NAME = "Photobooth"
const EVENT_LOCATION = "Elite Fitness Kediri"
const EVENT_DATE = "13/09/26"
const SESSION_DURATION = 120000
const PHOTO_DELAY_SECONDS = 7
const MAX_PHOTOS = 3
const MAX_RETAKES = 2
const QR_TIMEOUT_MS = 60000
const EXPORT_WIDTH = 1200
const EXPORT_PADDING = 68
const EXPORT_GAP = 26

const $ = id => document.getElementById(id)
const video = $("video")
const instructionPreview = $("instructionPreview")
const photosContainer = $("photos")
const countdownEl = $("countdown")
const retakeBtn = $("retakeBtn")
const sessionCodeEl = $("sessionCode")
const dateTimeEl = $("datetime")
const qrCanvas = $("qrCanvas")
const qrStatus = $("qrStatus")
const downloadLink = $("downloadLink")
const startBtn = $("startBtn")

const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let cameraStream = null
let animationFrame = null
let sessionStart = null
let capturing = false
let sessionActive = false
let isUploading = false
let retakesLeft = MAX_RETAKES
let capturedPhotos = []
let currentSessionCode = ""
let currentCaptureTime = ""
let qrCloseTimer = null

const captions = [
  "Sweet moments in motion",
  "Run, smile, repeat",
  "Good vibes, great strides",
  "Making memories one step at a time"
]

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"))
  $(id)?.classList.add("active")
}

function generateSessionCode() {
  return `TS-${Date.now().toString().slice(-6)}`
}

function updateSessionMeta() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, "0")
  const mm = String(now.getMinutes()).padStart(2, "0")
  currentCaptureTime = `${hh}:${mm}`
  currentSessionCode = generateSessionCode()
  if (sessionCodeEl) sessionCodeEl.textContent = currentSessionCode
  if (dateTimeEl) dateTimeEl.textContent = `${EVENT_DATE} | ${currentCaptureTime}`
}

function updateRetakeUI() {
  if (retakeBtn) retakeBtn.textContent = `Coba Lagi (${retakesLeft})`
}

function resetProgress() {
  ;["progressTop", "progressRight", "progressBottom", "progressLeft"].forEach(id => {
    const el = $(id)
    if (!el) return
    el.style.width = "0%"
    el.style.height = "0%"
    el.style.opacity = "1"
  })
}

function updateProgress(elapsed) {
  const percent = Math.min(100, (elapsed / SESSION_DURATION) * 100)
  const top = $("progressTop"), right = $("progressRight"), bottom = $("progressBottom"), left = $("progressLeft")
  ;[top, right, bottom, left].forEach(el => { if (el) { el.style.width = "0%"; el.style.height = "0%" } })
  if (percent <= 25) top.style.width = `${percent * 4}%`
  else if (percent <= 50) { top.style.width = "100%"; right.style.height = `${(percent - 25) * 4}%` }
  else if (percent <= 75) { top.style.width = "100%"; right.style.height = "100%"; bottom.style.width = `${(percent - 50) * 4}%` }
  else { top.style.width = "100%"; right.style.height = "100%"; bottom.style.width = "100%"; left.style.height = `${(percent - 75) * 4}%` }
  const pulse = percent > 90 ? (Math.sin(Date.now() / 100) > 0 ? "1" : ".35") : "1"
  ;[top, right, bottom, left].forEach(el => { if (el) el.style.opacity = pulse })
}

function runSessionTimer() {
  const elapsed = Date.now() - sessionStart
  updateProgress(elapsed)
  if (elapsed >= SESSION_DURATION) {
    stopSessionForce()
    alert("Waktu sesi habis")
    return
  }
  animationFrame = requestAnimationFrame(runSessionTimer)
}

async function getCameraStream() {
  if (cameraStream) return cameraStream
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  return cameraStream
}

function stopCameraStream() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop())
  cameraStream = null
  if (video) video.srcObject = null
  if (instructionPreview) instructionPreview.srcObject = null
}

async function startInstructionPreview() {
  try {
    const stream = await getCameraStream()
    instructionPreview.srcObject = stream
    await instructionPreview.play()
  } catch (error) {
    console.warn("Camera preview unavailable", error)
  }
}

function stopInstructionPreview() {
  if (!instructionPreview) return
  instructionPreview.pause()
  instructionPreview.srcObject = null
}

async function startMainPreview() {
  const stream = await getCameraStream()
  stopInstructionPreview()
  video.srcObject = stream
  await video.play()
}

async function goInstruction() {
  showScreen("instructionScreen")
  await startInstructionPreview()
}

async function startSession() {
  try {
    showScreen("cameraScreen")
    await startMainPreview()
    resetSession()
    sessionStart = Date.now()
    runSessionTimer()
    startCapture()
  } catch (error) {
    console.error(error)
    alert("Kamera gagal dibuka. Pastikan izin kamera diizinkan dan halaman dibuka melalui HTTPS atau localhost.")
    showScreen("instructionScreen")
  }
}

function renderPhotoPlaceholders() {
  photosContainer.innerHTML = ""
  for (let index = 0; index < MAX_PHOTOS; index += 1) {
    const slot = document.createElement("div")
    slot.className = "photo-placeholder"
    slot.dataset.gleanId = `photo-placeholder-${index + 1}`
    const label = document.createElement("span")
    label.textContent = `PHOTO ${index + 1}`
    slot.appendChild(label)
    photosContainer.appendChild(slot)
  }
}

function resetSession() {
  retakesLeft = MAX_RETAKES
  capturedPhotos = []
  capturing = false
  sessionActive = false
  renderPhotoPlaceholders()
  countdownEl.textContent = ""
  updateRetakeUI()
  updateSessionMeta()
  resetProgress()
}

function countdown(seconds) {
  return new Promise(resolve => {
    let remaining = seconds
    countdownEl.textContent = remaining
    const timer = setInterval(() => {
      if (!sessionActive) {
        clearInterval(timer)
        countdownEl.textContent = ""
        resolve()
        return
      }
      remaining -= 1
      countdownEl.textContent = remaining > 0 ? remaining : ""
      if (remaining <= 0) {
        clearInterval(timer)
        resolve()
      }
    }, 1000)
  })
}

function flashScreen() {
  const flash = document.createElement("div")
  flash.className = "camera-flash"
  Object.assign(flash.style, { position: "fixed", inset: "0", zIndex: "9999", background: "#fff" })
  document.body.appendChild(flash)
  setTimeout(() => flash.remove(), 120)
}

function appendPhoto(src) {
  if (capturedPhotos.length === 1) photosContainer.innerHTML = ""
  const image = document.createElement("img")
  image.src = src
  image.alt = "Captured running-event photo"
  image.dataset.gleanId = `captured-photo-${capturedPhotos.length}`
  photosContainer.appendChild(image)
}

async function captureSinglePhoto() {
  const width = video.videoWidth || 1920
  const height = video.videoHeight || 1080
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, width, height)
  return canvas.toDataURL("image/jpeg", .94)
}

async function startCapture() {
  if (capturing || !video.videoWidth) return
  capturing = true
  sessionActive = true
  renderPhotoPlaceholders()
  capturedPhotos = []
  for (let index = 0; index < MAX_PHOTOS; index += 1) {
    if (!sessionActive) break
    await countdown(PHOTO_DELAY_SECONDS)
    if (!sessionActive) break
    const src = await captureSinglePhoto()
    capturedPhotos.push(src)
    appendPhoto(src)
    flashScreen()
  }
  capturing = false
}

function retake() {
  if (capturing) return
  if (retakesLeft <= 0) return alert("Kesempatan coba lagi sudah habis")
  retakesLeft -= 1
  updateRetakeUI()
  startCapture()
}

function stopSession() {
  if (confirm("Yakin berhenti dari sesi ini?")) stopSessionForce()
}

function stopSessionForce() {
  sessionActive = false
  capturing = false
  countdownEl.textContent = ""
  cancelAnimationFrame(animationFrame)
  resetProgress()
  stopCameraStream()
  showScreen("startScreen")
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const x = (width - drawWidth) / 2
  const y = (height - drawHeight) / 2
  ctx.drawImage(image, x, y, drawWidth, drawHeight)
}

function drawRoundedImage(ctx, image, x, y, width, height, radius) {
  ctx.save()
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius)
  else {
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + width, y, x + width, y + height, radius)
    ctx.arcTo(x + width, y + height, x, y + height, radius)
    ctx.arcTo(x, y + height, x, y, radius)
    ctx.arcTo(x, y, x + width, y, radius)
  }
  ctx.clip()
  ctx.drawImage(image, x, y, width, height)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = "rgba(255,255,255,.95)"
  ctx.lineWidth = 8
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius)
  ctx.stroke()
  ctx.restore()
}

async function renderStripBlob() {
  if (capturedPhotos.length !== MAX_PHOTOS) throw new Error("Belum ada 3 foto lengkap")
  const [background, logo, ...images] = await Promise.all([
    loadImage("running-event-strip-background.png"),
    loadImage("logo.png"),
    ...capturedPhotos.map(loadImage)
  ])
  const photoWidth = EXPORT_WIDTH - EXPORT_PADDING * 2
  const photoHeights = images.map(image => Math.round(photoWidth * (image.height / image.width)))
  const headerHeight = 300
  const footerHeight = 350
  const photosHeight = photoHeights.reduce((sum, height) => sum + height, 0) + EXPORT_GAP * (images.length - 1)
  const canvas = document.createElement("canvas")
  canvas.width = EXPORT_WIDTH
  canvas.height = EXPORT_PADDING * 2 + headerHeight + photosHeight + footerHeight
  const ctx = canvas.getContext("2d")

  drawCover(ctx, background, canvas.width, canvas.height)
  ctx.fillStyle = "rgba(255,247,251,.56)"
  ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48)

  const logoWidth = 660
  const logoHeight = logoWidth * (logo.height / logo.width)
  ctx.save()
  ctx.filter = "brightness(.52) saturate(.86) contrast(1.10)"
  ctx.drawImage(logo, (canvas.width - logoWidth) / 2, 58, logoWidth, logoHeight)
  ctx.restore()

  let y = EXPORT_PADDING + headerHeight
  ctx.textAlign = "center"
  ctx.fillStyle = "#b34b7a"
  ctx.font = "800 48px Trebuchet MS, sans-serif"
  ctx.fillText("RUN • SMILE • REPEAT", canvas.width / 2, y - 34)

  images.forEach((image, index) => {
    drawRoundedImage(ctx, image, EXPORT_PADDING, y, photoWidth, photoHeights[index], 24)
    y += photoHeights[index] + EXPORT_GAP
  })

  y += 18
  ctx.fillStyle = "#b34b7a"
  ctx.font = "italic 42px Georgia, serif"
  ctx.fillText("Sweet moments in motion", canvas.width / 2, y)
  y += 74
  ctx.fillStyle = "#7d2855"
  ctx.font = "700 32px Trebuchet MS, sans-serif"
  ctx.fillText("@thesweetkediri", canvas.width / 2, y)
  y += 48
  ctx.font = "700 28px Trebuchet MS, sans-serif"
  ctx.fillText(`${EVENT_LOCATION} • ${EVENT_DATE} | ${currentCaptureTime}`, canvas.width / 2, y)
  y += 58
  ctx.font = "italic 30px Georgia, serif"
  ctx.fillText("Made with love by The Sweets", canvas.width / 2, y)

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Gagal membuat photo strip")), "image/png"))
}

async function createSignedUrl(filePath, attempts = 5) {
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(filePath, 60 * 30)
    if (!error && data?.signedUrl) return data.signedUrl
    lastError = error
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
  }
  throw lastError || new Error("Gagal membuat link download")
}

async function uploadStrip(blob) {
  if (!supabaseClient) throw new Error("Supabase belum tersedia")
  const filePath = `strips/${new Date().toISOString().slice(0, 10)}/${currentSessionCode}-${Date.now()}.png`
  const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(filePath, blob, { contentType: "image/png", upsert: false })
  if (error) throw error
  return createSignedUrl(filePath)
}

async function showQRCode(url) {
  showScreen("qrScreen")
  qrStatus.textContent = "Scan QR untuk download foto"
  downloadLink.href = url
  downloadLink.textContent = "Buka foto"
  qrCanvas.width = 280
  qrCanvas.height = 280
  if (window.QRCode?.toCanvas) {
    await QRCode.toCanvas(qrCanvas, url, { width: 280, margin: 2, color: { dark: "#351a2b", light: "#ffffff" } })
  } else {
    qrStatus.textContent = "QR belum tersedia. Gunakan tombol Buka foto."
  }
  clearTimeout(qrCloseTimer)
  qrCloseTimer = setTimeout(closeQRSession, QR_TIMEOUT_MS)
}

function closeQRSession() {
  clearTimeout(qrCloseTimer)
  stopSessionForce()
  const ctx = qrCanvas.getContext("2d")
  ctx?.clearRect(0, 0, qrCanvas.width, qrCanvas.height)
  downloadLink.removeAttribute("href")
  downloadLink.textContent = ""
  qrStatus.textContent = ""
}

async function printStrip() {
  if (isUploading) return
  if (capturedPhotos.length !== MAX_PHOTOS) return alert("Tunggu sampai 3 foto selesai diambil dulu ya.")
  if (!confirm("Sudah puas dengan foto kamu?")) return
  try {
    isUploading = true
    qrStatus.textContent = "Menyiapkan QR..."
    const blob = await renderStripBlob()
    const signedUrl = await uploadStrip(blob)
    stopCameraStream()
    await showQRCode(signedUrl)
  } catch (error) {
    console.error(error)
    alert(`Gagal upload foto: ${error?.message || "Coba lagi"}`)
  } finally {
    isUploading = false
  }
}

startBtn?.addEventListener("click", goInstruction)
$("beginSessionBtn")?.addEventListener("click", startSession)
retakeBtn?.addEventListener("click", retake)
$("printBtn")?.addEventListener("click", printStrip)
$("stopBtn")?.addEventListener("click", stopSession)
$("closeQrBtn")?.addEventListener("click", closeQRSession)

window.addEventListener("beforeunload", stopCameraStream)
