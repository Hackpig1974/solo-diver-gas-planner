// SDI RDP data tables (loaded securely via preload.js)
let SDI_TABLE1;
let SDI_TABLE3;

const TANKS = {
  AL63: { label: 'Aluminum 63', nominalCf: 63, actualCf: 63.5, ratedPsi: '3000 PSI' },
  AL80: { label: 'Aluminum 80', nominalCf: 80, actualCf: 77.4, ratedPsi: '3000 PSI' },
  AL100: { label: 'Aluminum 100', nominalCf: 100, actualCf: 98.8, ratedPsi: '3300 PSI' },
  AL120: { label: 'Aluminum 120', nominalCf: 120, actualCf: 121.0, ratedPsi: '3300 PSI' },
  HP80: { label: 'Steel HP80', nominalCf: 80, actualCf: 80.1, ratedPsi: '3442 PSI' },
  HP100: { label: 'Steel HP100', nominalCf: 100, actualCf: 101.3, ratedPsi: '3442 PSI' },
  HP120: { label: 'Steel HP120', nominalCf: 120, actualCf: 120.1, ratedPsi: '3442 PSI' }
};

const PG_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'Z'];
const RESULT_PREFIXES = ['rnt', 'tbt', 'pg', 'ndl', 'adjNdl', 'ata', 'sacAdj', 'gasCf', 'gasPsi', 'endPsi'];
const INPUT_IDS = ['tankCapacity', 'ratedPressure', 'startingPressure', 'sacRate', 'diveFactor', 'numProfiles'];
const MAX_RECREATIONAL_DEPTH = 130;
const MIN_STARTING_PRESSURE = 500;
const MAX_STARTING_PRESSURE = 3500;
const MIN_RATED_PRESSURE = 500;
const MAX_RATED_PRESSURE = 3500;

function roundUpDepth(depth) {
  const supportedDepths = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130, 140];
  for (const supportedDepth of supportedDepths) {
    if (depth <= supportedDepth) {
      return supportedDepth;
    }
  }
  return 140;
}

function lookupRNT(pressureGroup, depth) {
  if (!pressureGroup) {
    return 0;
  }
  return SDI_TABLE3[String(roundUpDepth(depth))][pressureGroup] || 0;
}

function lookupPG(depth, totalBottomTime) {
  const tableDepth = String(roundUpDepth(depth));
  const depthData = SDI_TABLE1[tableDepth];
  if (!depthData) {
    return '';
  }
  for (const pressureGroup of PG_ORDER) {
    if (depthData.groups[pressureGroup] && totalBottomTime <= depthData.groups[pressureGroup]) {
      return pressureGroup;
    }
  }
  return 'Z';
}

function lookupNDL(depth) {
  return SDI_TABLE1[String(roundUpDepth(depth))]?.ndl || 999;
}

function formatWithCommas(value) {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function syncTankTypeOptions() {
  const tankType = document.getElementById('tankType');
  Array.from(tankType.options).forEach((option) => {
    const tank = TANKS[option.value];
    if (tank) {
      option.textContent = tank.label;
    }
  });
}

function applySelectedTankDefaults() {
  const tankType = document.getElementById('tankType');
  const tankCapacity = document.getElementById('tankCapacity');
  const ratedPressure = document.getElementById('ratedPressure');
  const startingPressure = document.getElementById('startingPressure');
  const tank = TANKS[tankType.value];

  if (tankType.value === 'CUSTOM') {
    tankCapacity.readOnly = false;
    ratedPressure.readOnly = false;
    return;
  }

  tankCapacity.value = tank ? tank.actualCf.toFixed(1) : '80.0';
  tankCapacity.readOnly = true;
  if (tank) {
    const parsedRatedPressure = parseFloat(tank.ratedPsi.replace(/[^0-9.]/g, ''));
    ratedPressure.value = formatWithCommas(parsedRatedPressure);
    ratedPressure.readOnly = true;
    startingPressure.value = formatWithCommas(parsedRatedPressure);
  }
}

function syncDiveFactorInput() {
  const diveFactorPreset = document.getElementById('diveFactorPreset');
  const diveFactor = document.getElementById('diveFactor');
  const sacRate = document.getElementById('sacRate');

  if (diveFactorPreset.value === 'CUSTOM') {
    diveFactor.classList.remove('profile-hidden');
    if (!diveFactor.value) {
      diveFactor.value = '1.0';
    }
    sacRate.value = '0.5';
    sacRate.readOnly = true;
  } else {
    diveFactor.value = parseFloat(diveFactorPreset.value).toFixed(1);
    diveFactor.classList.add('profile-hidden');
    if (diveFactorPreset.value === '1.0') {
      sacRate.readOnly = false;
    } else {
      sacRate.value = '0.5';
      sacRate.readOnly = true;
    }
  }
}

function clearOutputs(index) {
  RESULT_PREFIXES.forEach((prefix) => {
    document.getElementById(`${prefix}${index}`).textContent = '';
  });
}

function clearAllOutputs() {
  for (let i = 1; i <= 6; i++) {
    clearOutputs(i);
  }
}

function parseNumericInput(elementId, { stripCommas = false } = {}) {
  const element = document.getElementById(elementId);
  const rawValue = stripCommas ? element.value.replace(/,/g, '').trim() : element.value.trim();

  if (rawValue === '') {
    return { rawValue, value: null, hasValue: false };
  }

  const value = Number(rawValue);
  return { rawValue, value, hasValue: true };
}

function addValidationError(errors, fieldId, message) {
  errors[fieldId] = message;
}

function readInputs() {
  const tankCapacity = parseNumericInput('tankCapacity');
  const ratedPressure = parseNumericInput('ratedPressure', { stripCommas: true });
  const startingPressure = parseNumericInput('startingPressure', { stripCommas: true });
  const sacRate = parseNumericInput('sacRate');
  const diveFactor = parseNumericInput('diveFactor');
  const tankType = document.getElementById('tankType').value;
  const numProfiles = parseInt(document.getElementById('numProfiles').value, 10);
  const activeRows = [];

  for (let i = 1; i <= 6; i++) {
    activeRows.push({
      i,
      isActive: i <= numProfiles || i === 6,
      depth: parseNumericInput(`depth${i}`),
      duration: parseNumericInput(`duration${i}`)
    });
  }

  return {
    tankCapacity,
    ratedPressure,
    startingPressure,
    sacRate,
    diveFactor,
    tankType,
    numProfiles,
    activeRows
  };
}

function validateInputs(inputs) {
  const errors = {};

  if (!Number.isInteger(inputs.numProfiles) || inputs.numProfiles < 1 || inputs.numProfiles > 5) {
    addValidationError(errors, 'numProfiles', 'Select between 1 and 5 profiles.');
  }

  if (!inputs.tankCapacity.hasValue || !Number.isFinite(inputs.tankCapacity.value) || inputs.tankCapacity.value <= 0) {
    addValidationError(errors, 'tankCapacity', 'Tank capacity must be greater than 0.');
  }

  if (!inputs.ratedPressure.hasValue || !Number.isFinite(inputs.ratedPressure.value)) {
    addValidationError(errors, 'ratedPressure', 'Rated pressure is required.');
  } else if (inputs.ratedPressure.value < MIN_RATED_PRESSURE) {
    addValidationError(errors, 'ratedPressure', `Rated pressure must be at least ${MIN_RATED_PRESSURE} psi.`);
  } else if (inputs.ratedPressure.value > MAX_RATED_PRESSURE) {
    addValidationError(errors, 'ratedPressure', `Rated pressure cannot exceed ${MAX_RATED_PRESSURE} psi.`);
  }

  if (!inputs.startingPressure.hasValue || !Number.isFinite(inputs.startingPressure.value)) {
    addValidationError(errors, 'startingPressure', 'Starting pressure is required.');
  } else if (inputs.startingPressure.value < MIN_STARTING_PRESSURE) {
    addValidationError(errors, 'startingPressure', `Starting pressure must be at least ${MIN_STARTING_PRESSURE} psi.`);
  } else if (inputs.startingPressure.value > MAX_STARTING_PRESSURE) {
    addValidationError(errors, 'startingPressure', `Starting pressure cannot exceed ${MAX_STARTING_PRESSURE} psi.`);
  } else if (inputs.ratedPressure.hasValue && Number.isFinite(inputs.ratedPressure.value) && inputs.startingPressure.value > inputs.ratedPressure.value) {
    addValidationError(errors, 'startingPressure', 'Starting pressure cannot exceed rated pressure.');
  }

  if (!inputs.sacRate.hasValue || !Number.isFinite(inputs.sacRate.value) || inputs.sacRate.value <= 0) {
    addValidationError(errors, 'sacRate', 'SAC rate must be greater than 0.');
  }

  if (!inputs.diveFactor.hasValue || !Number.isFinite(inputs.diveFactor.value) || inputs.diveFactor.value <= 0) {
    addValidationError(errors, 'diveFactor', 'Dive factor must be greater than 0.');
  }

  inputs.activeRows.forEach((row) => {
    if (!row.isActive) {
      return;
    }

    const isSafetyStop = row.i === 6;
    const hasDepth = row.depth.hasValue;
    const hasDuration = row.duration.hasValue;

    if (!isSafetyStop && !hasDepth && !hasDuration) {
      return;
    }

    if (!hasDepth) {
      addValidationError(errors, `depth${row.i}`, 'Depth is required when a profile is in use.');
    } else if (!Number.isFinite(row.depth.value) || row.depth.value <= 0) {
      addValidationError(errors, `depth${row.i}`, 'Depth must be greater than 0.');
    } else if (row.depth.value > MAX_RECREATIONAL_DEPTH) {
      addValidationError(errors, `depth${row.i}`, `Depth cannot exceed ${MAX_RECREATIONAL_DEPTH} ft.`);
    }

    if (!hasDuration) {
      addValidationError(errors, `duration${row.i}`, 'Duration is required when a profile is in use.');
    } else if (!Number.isFinite(row.duration.value) || row.duration.value <= 0) {
      addValidationError(errors, `duration${row.i}`, 'Duration must be greater than 0.');
    }
  });

  return errors;
}

function renderValidationErrors(errors) {
  const validationMessage = document.getElementById('validationMessage');
  const fieldIds = ['tankCapacity', 'ratedPressure', 'startingPressure', 'sacRate', 'diveFactor'];

  for (let i = 1; i <= 6; i++) {
    fieldIds.push(`depth${i}`, `duration${i}`);
  }

  fieldIds.forEach((fieldId) => {
    const element = document.getElementById(fieldId);
    const message = errors[fieldId];
    element.classList.toggle('invalid-input', Boolean(message));
    if (message) {
      element.setAttribute('aria-invalid', 'true');
      element.title = message;
    } else {
      element.removeAttribute('aria-invalid');
      element.removeAttribute('title');
    }
  });

  const errorMessages = Object.values(errors);
  validationMessage.textContent = errorMessages.length > 0
    ? `Fix highlighted fields to calculate. ${errorMessages[0]}`
    : '';
}

function updateProfileVisibility() {
  const profileCount = parseInt(document.getElementById('numProfiles').value, 10);
  for (let i = 1; i <= 6; i++) {
    const visible = i <= profileCount || i === 6;
    const className = visible ? '' : 'profile-hidden';
    document.getElementById(`hdr${i}`).className = className;
    document.getElementById(`hdr-n${i}`).className = className;
    document.getElementById(`hdr-g${i}`).className = className;
    document.querySelectorAll(`#depth${i}, #duration${i}`).forEach((element) => {
      element.closest('td').className = className;
    });
    document.querySelectorAll(`#rnt${i}, #tbt${i}, #pg${i}, #ndl${i}, #adjNdl${i}, #ata${i}, #sacAdj${i}, #gasCf${i}, #gasPsi${i}, #endPsi${i}`).forEach((element) => {
      element.className = `result-value ${className}`;
    });
  }
  calculate();
}

function calculate() {
  const inputs = readInputs();
  const errors = validateInputs(inputs);
  renderValidationErrors(errors);

  inputs.activeRows.forEach((row) => {
    if (!row.isActive) {
      clearOutputs(row.i);
    }
  });

  if (Object.keys(errors).length > 0) {
    clearAllOutputs();
    return;
  }

  const tankCapacity = inputs.tankCapacity.value;
  const ratedPressure = inputs.ratedPressure.value;
  const startingPressure = inputs.startingPressure.value;
  const sacRate = inputs.sacRate.value;
  const diveFactor = inputs.diveFactor.value;
  const activeRows = inputs.activeRows.filter((row) => row.isActive);

  let remainingPressure = startingPressure;
  let carryRnt = 0;

  for (let index = 0; index < activeRows.length; index++) {
    const row = activeRows[index];
    if (!row.depth.hasValue && !row.duration.hasValue) {
      clearOutputs(row.i);
      carryRnt = 0;
      continue;
    }

    const depth = row.depth.value;
    const duration = row.duration.value;
    const totalBottomTime = duration + carryRnt;
    const endingPressureGroup = lookupPG(depth, totalBottomTime);
    const ndl = lookupNDL(depth);
    const adjustedNdl = ndl - carryRnt;
    const ata = (depth / 33) + 1;
    const sacAdjusted = sacRate * ata;
    const gasCf = sacAdjusted * diveFactor * duration;
    const gasPsi = gasCf * (ratedPressure / tankCapacity);
    remainingPressure -= gasPsi;

    let nextRnt = '';
    if (index < activeRows.length - 1) {
      const nextDepth = activeRows[index + 1].depth.value;
      if (nextDepth > 0) {
        nextRnt = lookupRNT(endingPressureGroup, nextDepth);
      }
    } else if (depth > 0) {
      nextRnt = lookupRNT(endingPressureGroup, depth);
    }

    document.getElementById(`rnt${row.i}`).textContent = nextRnt;
    document.getElementById(`tbt${row.i}`).textContent = totalBottomTime;
    document.getElementById(`pg${row.i}`).textContent = endingPressureGroup;
    document.getElementById(`ndl${row.i}`).textContent = ndl === 999 ? 'Unlimited' : ndl;
    document.getElementById(`adjNdl${row.i}`).textContent = adjustedNdl === 999 ? 'Unlimited' : adjustedNdl;
    document.getElementById(`ata${row.i}`).textContent = ata.toFixed(1);
    document.getElementById(`sacAdj${row.i}`).textContent = sacAdjusted.toFixed(1);
    document.getElementById(`gasCf${row.i}`).textContent = gasCf.toFixed(1);
    document.getElementById(`gasPsi${row.i}`).textContent = formatWithCommas(gasPsi);
    document.getElementById(`endPsi${row.i}`).textContent = formatWithCommas(remainingPressure);

    carryRnt = nextRnt === '' ? 0 : nextRnt;
  }
}

function reset() {
  for (let i = 1; i <= 6; i++) {
    document.getElementById(`depth${i}`).value = '';
    document.getElementById(`duration${i}`).value = '';
    clearOutputs(i);
  }
  document.getElementById('depth6').value = '15';
  document.getElementById('duration6').value = '3';
  updateProfileVisibility();
  calculate();
}

function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}

function reportContentSize() {
  const container = document.getElementById('mainContainer');
  const width = Math.ceil((container?.getBoundingClientRect().width || document.documentElement.scrollWidth) + 40);
  const height = Math.ceil(document.documentElement.scrollHeight + 20);
  window.electronAPI.reportContentSize({ width, height });
}

window.calculate = calculate;
window.reset = reset;

window.electronAPI.onResetRequested(() => {
  reset();
});

document.getElementById('tankType').addEventListener('change', function () {
  applySelectedTankDefaults();
  calculate();
});

document.getElementById('numProfiles').addEventListener('change', updateProfileVisibility);

document.querySelectorAll('input[type="number"], input[type="text"]').forEach((element) => {
  element.addEventListener('input', calculate);
});

document.getElementById('diveFactorPreset').addEventListener('change', function () {
  syncDiveFactorInput();
  calculate();
});

document.getElementById('startingPressure').addEventListener('blur', function () {
  const value = this.value.replace(/,/g, '');
  if (!isNaN(value) && value !== '') {
    this.value = formatWithCommas(parseFloat(value));
  }
  calculate();
});

document.getElementById('ratedPressure').addEventListener('blur', function () {
  const value = this.value.replace(/,/g, '');
  if (!isNaN(value) && value !== '') {
    this.value = formatWithCommas(parseFloat(value));
  }
  calculate();
});

document.getElementById('diveFactor').addEventListener('blur', function () {
  const value = parseFloat(this.value);
  if (!isNaN(value)) {
    this.value = value.toFixed(1);
  }
  calculate();
});

document.getElementById('themeSelector').addEventListener('change', function () {
  applyTheme(this.value);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (document.getElementById('themeSelector').value === 'system') {
    document.documentElement.setAttribute('data-theme', event.matches ? 'dark' : 'light');
  }
  reportContentSize();
});

window.addEventListener('DOMContentLoaded', async () => {
  // Load SDI data first
  const sdiData = await window.electronAPI.getSdiData();
  SDI_TABLE1 = sdiData.TABLE1;
  SDI_TABLE3 = sdiData.TABLE3;
  
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.getElementById('themeSelector').value = savedTheme;
  syncTankTypeOptions();
  applySelectedTankDefaults();
  syncDiveFactorInput();
  applyTheme(savedTheme);
  updateProfileVisibility();
  calculate();
  reportContentSize();
  
  // Check for updates on startup
  checkForUpdate();
  setupUpdateBanner();
});

// Update system functions
async function checkForUpdate() {
  try {
    const result = await window.electronAPI.checkForUpdate();
    console.log('Update check result:', result);
    
    if (!result.hasUpdate) {
      console.log('No update available');
      return;
    }
    
    console.log('Update available! Showing banner...');
    const updateBanner = document.getElementById('updateBanner');
    const updateBannerText = document.getElementById('updateBannerText');
    const mainContainer = document.getElementById('mainContainer');
    
    updateBannerText.textContent = `\u25B2 Version ${result.version} available \u2014 click to download`;
    updateBanner.style.display = 'flex';
    mainContainer.classList.add('with-banner');
    reportContentSize();
    
    // Click to open release page
    updateBannerText.onclick = () => { 
      window.electronAPI.openReleaseUrl(result.url); 
    };
  } catch (error) {
    console.error('Update check failed:', error);
  }
}

function setupUpdateBanner() {
  const dismissBtn = document.getElementById('updateBannerDismiss');
  const updateBanner = document.getElementById('updateBanner');
  const mainContainer = document.getElementById('mainContainer');

  dismissBtn.textContent = '\u00D7';
  dismissBtn.onclick = () => {
    updateBanner.style.display = 'none';
    mainContainer.classList.remove('with-banner');
    reportContentSize();
  };
}
