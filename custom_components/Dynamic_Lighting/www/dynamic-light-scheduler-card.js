// File: custom_components/dynamic_light_scheduler/www/dynamic-light-scheduler-card.js

class DynamicLightSchedulerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.points = [];
    this.isDragging = false;
    this.dragPointIndex = -1;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this.render();
    }
    this.updateCard();
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this.config = config;
  }

  getCardSize() {
    return 6;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--ha-card-background, var(--card-background-color, white));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,0.1));
          padding: 16px;
          margin: 8px 0;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--divider-color);
        }

        .card-title {
          font-size: 1.2em;
          font-weight: 500;
          color: var(--primary-text-color);
        }

        .current-info {
          display: flex;
          gap: 16px;
          font-size: 0.9em;
          color: var(--secondary-text-color);
        }

        .chart-container {
          position: relative;
          width: 100%;
          height: 300px;
          margin: 16px 0;
          background: var(--secondary-background-color);
          border-radius: 8px;
          overflow: hidden;
        }

        canvas {
          width: 100%;
          height: 100%;
          cursor: crosshair;
        }

        .controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .control-button {
          background: var(--primary-color);
          color: var(--text-primary-color);
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          transition: background-color 0.2s;
        }

        .control-button:hover {
          background: var(--primary-color-dark);
        }

        .control-button:disabled {
          background: var(--disabled-color);
          cursor: not-allowed;
        }

        .status-info {
          background: var(--secondary-background-color);
          padding: 12px;
          border-radius: 6px;
          margin-top: 16px;
          font-size: 0.9em;
        }

        .status-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .status-row:last-child {
          margin-bottom: 0;
        }

        .point-info {
          position: absolute;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          pointer-events: none;
          z-index: 100;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .error-message {
          color: var(--error-color);
          font-size: 0.9em;
          margin-top: 8px;
        }
      </style>

      <div class="card-content">
        <div class="card-header">
          <div class="card-title">Dynamic Light Schedule</div>
          <div class="current-info">
            <span>Target: <span id="target-brightness">--</span>%</span>
            <span>Current: <span id="current-brightness">--</span>%</span>
          </div>
        </div>

        <div class="chart-container">
          <canvas id="schedule-chart"></canvas>
          <div class="point-info" id="point-info"></div>
        </div>

        <div class="controls">
          <button class="control-button" id="reset-btn">Reset to Default</button>
          <button class="control-button" id="save-btn">Save Schedule</button>
          <button class="control-button" id="add-point-btn">Add Point</button>
        </div>

        <div class="status-info">
          <div class="status-row">
            <span>Schedule Points:</span>
            <span id="point-count">0</span>
          </div>
          <div class="status-row">
            <span>Current Time:</span>
            <span id="current-time">--:--</span>
          </div>
          <div class="status-row">
            <span>Last Update:</span>
            <span id="last-update">Never</span>
          </div>
        </div>

        <div class="error-message" id="error-message" style="display: none;"></div>
      </div>
    `;

    this.content = this.shadowRoot.querySelector('.card-content');
    this.canvas = this.shadowRoot.getElementById('schedule-chart');
    this.ctx = this.canvas.getContext('2d');
    this.pointInfo = this.shadowRoot.getElementById('point-info');

    this.setupCanvas();
    this.bindEvents();
    this.updateCurrentTime();
    
    // Update time every minute
    setInterval(() => this.updateCurrentTime(), 60000);
  }

  setupCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  bindEvents() {
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.hidePointInfo());

    this.shadowRoot.getElementById('reset-btn').addEventListener('click', () => this.resetSchedule());
    this.shadowRoot.getElementById('save-btn').addEventListener('click', () => this.saveSchedule());
    this.shadowRoot.getElementById('add-point-btn').addEventListener('click', () => this.showAddPointDialog());

    window.addEventListener('resize', () => {
      this.setupCanvas();
      this.drawChart();
    });
  }

  handleCanvasClick(e) {
    if (this.isDragging) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hour = (x / rect.width) * 24;
    const brightness = 100 - ((y - 20) / (rect.height - 40)) * 100;

    if (hour >= 0 && hour <= 24 && brightness >= 0 && brightness <= 100) {
      this.addOrUpdatePoint(hour, Math.max(0, Math.min(100, brightness)));
    }
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking near an existing point
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];
      const px = (point.hour / 24) * rect.width;
      const py = rect.height - 20 - ((point.brightness / 100) * (rect.height - 40));

      const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      if (distance < 10) {
        this.isDragging = true;
        this.dragPointIndex = i;
        this.canvas.style.cursor = 'grabbing';
        break;
      }
    }
  }

  handleMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.dragPointIndex = -1;
      this.canvas.style.cursor = 'crosshair';
      this.saveSchedule(); // Auto-save after dragging
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isDragging && this.dragPointIndex >= 0) {
      const hour = Math.max(0, Math.min(24, (x / rect.width) * 24));
      const brightness = Math.max(0, Math.min(100, 100 - ((y - 20) / (rect.height - 40)) * 100));
      
      this.points[this.dragPointIndex] = { hour, brightness };
      this.points.sort((a, b) => a.hour - b.hour);
      this.drawChart();
      return;
    }

    // Show point info on hover
    const hour = (x / rect.width) * 24;
    const targetBrightness = this.interpolateBrightness(hour);
    
    this.showPointInfo(e.clientX, e.clientY, hour, targetBrightness);

    // Change cursor when near points
    let nearPoint = false;
    for (const point of this.points) {
      const px = (point.hour / 24) * rect.width;
      const py = rect.height - 20 - ((point.brightness / 100) * (rect.height - 40));
      const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      
      if (distance < 10) {
        nearPoint = true;
        break;
      }
    }
    
    this.canvas.style.cursor = nearPoint ? 'grab' : 'crosshair';
  }

  showPointInfo(clientX, clientY, hour, brightness) {
    const info = this.pointInfo;
    const timeStr = `${Math.floor(hour)}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
    
    info.textContent = `${timeStr} - ${Math.round(brightness)}%`;
    info.style.left = (clientX + 10) + 'px';
    info.style.top = (clientY - 30) + 'px';
    info.style.opacity = '1';
  }

  hidePointInfo() {
    this.pointInfo.style.opacity = '0';
  }

  addOrUpdatePoint(hour, brightness) {
    const existingIndex = this.points.findIndex(p => Math.abs(p.hour - hour) < 0.5);
    
    if (existingIndex !== -1) {
      this.points[existingIndex].brightness = brightness;
    } else {
      this.points.push({ hour, brightness });
      this.points.sort((a, b) => a.hour - b.hour);
    }
    
    this.drawChart();
    this.updatePointCount();
    this.saveSchedule();
  }

  interpolateBrightness(hour) {
    if (this.points.length === 0) return 50;

    // Create extended points for smooth 24-hour wrap-around
    const extendedPoints = [
      ...this.points.map(p => ({ ...p, hour: p.hour - 24 })),
      ...this.points,
      ...this.points.map(p => ({ ...p, hour: p.hour + 24 }))
    ];

    // Find surrounding points
    let before = extendedPoints[0];
    let after = extendedPoints[extendedPoints.length - 1];

    for (let i = 0; i < extendedPoints.length - 1; i++) {
      if (extendedPoints[i].hour <= hour && extendedPoints[i + 1].hour >= hour) {
        before = extendedPoints[i];
        after = extendedPoints[i + 1];
        break;
      }
    }

    if (before.hour === after.hour) return before.brightness;

    // Smooth interpolation using smoothstep
    const t = (hour - before.hour) / (after.hour - before.hour);
    const smoothT = t * t * (3 - 2 * t);

    return before.brightness + (after.brightness - before.brightness) * smoothT;
  }

  drawChart() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.ctx.clearRect(0, 0, width, height);

    // Draw grid
    this.drawGrid(width, height);

    // Draw curve
    this.drawCurve(width, height);

    // Draw points
    this.drawPoints(width, height);

    // Draw current time indicator
    this.drawCurrentTimeIndicator(width, height);
  }

  drawGrid(width, height) {
    this.ctx.strokeStyle = getComputedStyle(this).getPropertyValue('--divider-color') || '#e0e0e0';
    this.ctx.lineWidth = 1;

    // Vertical lines (hours)
    for (let i = 0; i <= 24; i += 4) {
      const x = (i / 24) * width;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 20);
      this.ctx.lineTo(x, height - 20);
      this.ctx.stroke();

      // Hour labels
      this.ctx.fillStyle = getComputedStyle(this).getPropertyValue('--secondary-text-color') || '#666';
      this.ctx.font = '11px var(--paper-font-body1_-_font-family)';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${i}:00`, x, height - 6);
    }

    // Horizontal lines (brightness)
    for (let i = 0; i <= 100; i += 25) {
      const y = height - 20 - ((i / 100) * (height - 40));
      this.ctx.beginPath();
      this.ctx.moveTo(30, y);
      this.ctx.lineTo(width - 10, y);
      this.ctx.stroke();

      // Brightness labels
      this.ctx.fillStyle = getComputedStyle(this).getPropertyValue('--secondary-text-color') || '#666';
      this.ctx.font = '11px var(--paper-font-body1_-_font-family)';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`${i}%`, 25, y + 4);
    }
  }

  drawCurve(width, height) {
    this.ctx.strokeStyle = getComputedStyle(this).getPropertyValue('--primary-color') || '#03a9f4';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let hour = 0; hour <= 24; hour += 0.1) {
      const brightness = this.interpolateBrightness(hour);
      const x = (hour / 24) * width;
      const y = height - 20 - ((brightness / 100) * (height - 40));

      if (hour === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();

    // Add gradient fill
    this.ctx.lineTo(width, height - 20);
    this.ctx.lineTo(0, height - 20);
    this.ctx.closePath();

    const gradient = this.ctx.createLinearGradient(0, 20, 0, height - 20);
    const primaryColor = getComputedStyle(this).getPropertyValue('--primary-color') || '#03a9f4';
    gradient.addColorStop(0, primaryColor + '40');
    gradient.addColorStop(1, primaryColor + '10');
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }

  drawPoints(width, height) {
    this.points.forEach((point, index) => {
      const x = (point.hour / 24) * width;
      const y = height - 20 - ((point.brightness / 100) * (height - 40));

      this.ctx.beginPath();
      this.ctx.arc(x, y, this.dragPointIndex === index ? 8 : 6, 0, 2 * Math.PI);
      this.ctx.fillStyle = getComputedStyle(this).getPropertyValue('--accent-color') || '#ff9800';
      this.ctx.fill();
      this.ctx.strokeStyle = 'white';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    });
  }

  drawCurrentTimeIndicator(width, height) {
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const currentBrightness = this.interpolateBrightness(currentHour);

    const x = (currentHour / 24) * width;
    const y = height - 20 - ((currentBrightness / 100) * (height - 40));

    // Vertical line
    this.ctx.strokeStyle = getComputedStyle(this).getPropertyValue('--error-color') || '#f44336';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(x, 20);
    this.ctx.lineTo(x, height - 20);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Current point
    this.ctx.beginPath();
    this.ctx.arc(x, y, 6, 0, 2 * Math.PI);
    this.ctx.fillStyle = getComputedStyle(this).getPropertyValue('--error-color') || '#f44336';
    this.ctx.fill();
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  updateCard() {
    if (!this._hass || !this.config) return;

    const entity = this._hass.states[this.config.entity];
    if (!entity) {
      this.showError('Entity not found: ' + this.config.entity);
      return;
    }

    // Update points from entity attributes
    const schedulePoints = entity.attributes.schedule_points || [];
    if (JSON.stringify(this.points) !== JSON.stringify(schedulePoints)) {
      this.points = [...schedulePoints];
      this.drawChart();
    }

    // Update info displays
    const targetBrightness = entity.attributes.target_brightness_pct || 0;
    const currentBrightness = entity.attributes.current_brightness_pct || 0;
    const lastUpdate = entity.attributes.last_update;

    this.shadowRoot.getElementById('target-brightness').textContent = Math.round(targetBrightness);
    this.shadowRoot.getElementById('current-brightness').textContent = Math.round(currentBrightness);
    this.updatePointCount();

    if (lastUpdate) {
      const updateTime = new Date(lastUpdate);
      this.shadowRoot.getElementById('last-update').textContent = updateTime.toLocaleTimeString();
    }

    this.hideError();
  }

  updateCurrentTime() {
    const now = new Date();
    this.shadowRoot.getElementById('current-time').textContent = 
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (this.canvas) {
      this.drawChart();
    }
  }

  updatePointCount() {
    this.shadowRoot.getElementById('point-count').textContent = this.points.length;
  }

  resetSchedule() {
    const defaultPoints = [
      { hour: 0, brightness: 10 },
      { hour: 6, brightness: 30 },
      { hour: 8, brightness: 70 },
      { hour: 12, brightness: 90 },
      { hour: 18, brightness: 80 },
      { hour: 21, brightness: 40 },
      { hour: 23, brightness: 15 }
    ];

    this.points = [...defaultPoints];
    this.drawChart();
    this.updatePointCount();
    this.saveSchedule();
  }

  async saveSchedule() {
    if (!this._hass || !this.config) return;

    try {
      await this._hass.callService('dynamic_light_scheduler', 'update_schedule', {
        entity_id: this.config.entity,
        schedule_points: this.points
      });
    } catch (error) {
      this.showError('Failed to save schedule: ' + error.message);
    }
  }

  showAddPointDialog() {
    const hour = prompt('Enter hour (0-24):', '12');
    const brightness = prompt('Enter brightness (0-100):', '50');

    if (hour !== null && brightness !== null) {
      const h = parseFloat(hour);
      const b = parseInt(brightness);

      if (h >= 0 && h <= 24 && b >= 0 && b <= 100) {
        this.addOrUpdatePoint(h, b);
      } else {
        alert('Invalid values. Hour must be 0-24, brightness must be 0-100.');
      }
    }
  }

  showError(message) {
    const errorEl = this.shadowRoot.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  hideError() {
    this.shadowRoot.getElementById('error-message').style.display = 'none';
  }
}

customElements.define('dynamic-light-scheduler-card', DynamicLightSchedulerCard);

// Register the card with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'dynamic-light-scheduler-card',
  name: 'Dynamic Light Scheduler Card',
  description: 'Interactive card for managing dynamic light schedules',
  preview: true
});

// Add to Lovelace card picker
if (!window.customCards) {
  window.customCards = [];
}

window.customCards.push({
  type: 'dynamic-light-scheduler-card',
  name: 'Dynamic Light Scheduler Card',
  description: 'Card for Dynamic Light Scheduler integration'
});