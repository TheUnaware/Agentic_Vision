# AgenticVision 🦮👁️

> **A 360° wearable spatial perception neckband & on-device Agentic AI pipeline for the visually impaired.**  
> *See. Reason. Plan. Speak.*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-00E5FF?style=for-the-badge&logo=github)](https://TheUnaware.github.io/Agentic_Vision/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

## 🌐 Live Website

Experience the interactive 3D website and technical presentation:  
👉 **[https://TheUnaware.github.io/Agentic_Vision/](https://TheUnaware.github.io/Agentic_Vision/)**

📄 **Download Technical Jury Dossier (PDF):**  
👉 **[AgenticVision_Jury_Dossier.pdf](https://TheUnaware.github.io/Agentic_Vision/dossier/AgenticVision_Jury_Dossier.pdf)**

---

## 💡 Overview

Over 80 million people in India live with severe visual impairment, navigating complex, high-traffic urban environments. Existing smartphone apps provide only passive labels (*"Chair"*, *"Person"*) with **zero distance estimation**, **zero collision foresight**, and **no tactical navigation instructions**.

**AgenticVision** transforms passive detection into an active cognitive guide:
1. **360° Omnidirectional Wearable:** 4 autonomous sensor pods (Sony IMX708 12MP Wide + ST VL53L5CX 64-zone ToF) positioned at 45°, 135°, 225°, and 315° headings eliminate blind spots.
2. **Metric Distance Fusion:** Direct photon Time-of-Flight ranging calibrates dense neural depth (MiDaS) to ±2cm ground-truth accuracy.
3. **Kalman Trajectory Foresight:** Extended Kalman Filter projects moving hazard vectors 2–3 seconds into the future.
4. **On-Device Agentic Loop:** Quantized Phi-3 Mini reasoning model synthesizes tactical step-by-step guidance locally without cloud dependency.
5. **Open-Ear Acoustic Safety:** Directional acoustic nozzle delivers whisper-clear spoken navigation commands while keeping the ear canal 100% open to ambient environmental sounds.

---

## ⚡ Tech Stack

- **3D Graphics & Visuals:** Three.js, WebGL, GLTFLoader, GSAP (GreenSock), Lenis smooth scroll
- **Frontend / Bundler:** Vite, HTML5, CSS3, ES Modules
- **Hardware Architecture:** ESP32-S3 Dual-Core Xtensa LX7 (240MHz), Bosch BMI270 6-axis IMU, Sony IMX708, ST VL53L5CX
- **AI Perception Engine:** YOLOv10 Nano, MiDaS Relative Depth, Extended Kalman Filter, Microsoft Phi-3 Mini (ONNX Runtime / TensorRT)

---

## 🛠️ Local Development

```bash
# Clone the repository
git clone https://github.com/TheUnaware/Agentic_Vision.git
cd Agentic_Vision

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
npm run preview
```

---

## 📜 License

MIT License. Designed & Developed for the Visually Impaired Navigation Project.
