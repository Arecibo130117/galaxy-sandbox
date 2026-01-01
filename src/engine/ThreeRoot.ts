  private makeFlareTexture(size: number, kind: "core" | "halo"): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const cx = size * 0.5;
    const cy = size * 0.5;

    ctx.clearRect(0, 0, size, size);

    if (kind === "core") {
      // bright core with soft falloff
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
      g.addColorStop(0.0, "rgba(255,255,255,1.0)");
      g.addColorStop(0.12, "rgba(255,250,230,0.95)");
      g.addColorStop(0.30, "rgba(255,220,160,0.35)");
      g.addColorStop(1.0, "rgba(255,200,120,0.0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      // subtle streaks
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,240,220,0.08)";
      ctx.lineWidth = Math.max(1, Math.floor(size * 0.01));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI;
        const r = size * 0.48;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    } else {
      // halo / ghost ring
      const g = ctx.createRadialGradient(cx, cy, size * 0.10, cx, cy, size * 0.5);
      g.addColorStop(0.0, "rgba(255,255,255,0.0)");
      g.addColorStop(0.22, "rgba(255,240,210,0.05)");
      g.addColorStop(0.40, "rgba(255,220,170,0.10)");
      g.addColorStop(0.65, "rgba(255,210,140,0.05)");
      g.addColorStop(1.0, "rgba(255,200,120,0.0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      // thin ring accent
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,240,200,0.08)";
      ctx.lineWidth = Math.max(1, Math.floor(size * 0.01));
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  private ensureSunLightAndFlare() {
    if (!this.scene) return;

    if (!this.flareTex0) this.flareTex0 = this.makeFlareTexture(256, "core");
    if (!this.flareTex1) this.flareTex1 = this.makeFlareTexture(256, "halo");

    if (!this.sunLight) {
      // physically believable-ish: point light at sun
      this.sunLight = new THREE.PointLight(0xffffff, 6.0, 0, 2.0);
      this.sunLight.name = "sunLight";
      this.sunLight.castShadow = false;
      this.scene.add(this.sunLight);
    }

    if (!this.sunFlare) {
      this.sunFlare = new Lensflare();
      this.sunFlare.addElement(new LensflareElement(this.flareTex0!, 450, 0.0, new THREE.Color(1.0, 0.95, 0.85)));
      this.sunFlare.addElement(new LensflareElement(this.flareTex1!, 160, 0.35, new THREE.Color(1.0, 0.85, 0.55)));
      this.sunFlare.addElement(new LensflareElement(this.flareTex1!, 240, 0.55, new THREE.Color(0.9, 0.8, 1.0)));
      this.sunFlare.addElement(new LensflareElement(this.flareTex1!, 120, 0.75, new THREE.Color(1.0, 0.9, 0.75)));
      this.sunFlare.name = "sunFlare";
      this.sunLight!.add(this.sunFlare);
    }
  }
