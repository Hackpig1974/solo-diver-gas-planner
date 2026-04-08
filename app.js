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
  const startingPressure = document.getElementById('startingPressure');
  const tank = TANKS[tankType.value];

  if (tankType.value === 'CUSTOM') {
    tankCapacity.readOnly = false;
    return;
  }

  tankCapacity.value = tank ? tank.actualCf.toFixed(1) : '80.0';
  tankCapacity.readOnly = true;
  if (tank) {
    startingPressure.value = formatWithCommas(parseFloat(tank.ratedPsi.replace(/[^0-9.]/g, '')));
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
  ['rnt', 'tbt', 'pg', 'ndl', 'adjNdl', 'ata', 'sacAdj', 'gasCf', 'gasPsi', 'endPsi'].forEach((prefix) => {
    document.getElementById(`${prefix}${index}`).textContent = '';
  });
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
  const tankCapacity = parseFloat(document.getElementById('tankCapacity').value);
  const startingPressure = parseFloat(document.getElementById('startingPressure').value.replace(/,/g, ''));
  const sacRate = parseFloat(document.getElementById('sacRate').value);
  const diveFactor = parseFloat(document.getElementById('diveFactor').value);
  const numProfiles = parseInt(document.getElementById('numProfiles').value, 10);
  const activeRows = [];

  for (let i = 1; i <= 6; i++) {
    const isActive = i <= numProfiles || i === 6;
    if (!isActive) {
      clearOutputs(i);
      continue;
    }
    activeRows.push({
      i,
      depth: parseFloat(document.getElementById(`depth${i}`).value) || 0,
      duration: parseFloat(document.getElementById(`duration${i}`).value) || 0
    });
  }

  let remainingPressure = startingPressure;
  let carryRnt = 0;

  for (let index = 0; index < activeRows.length; index++) {
    const row = activeRows[index];
    if (row.depth === 0 || row.duration === 0) {
      clearOutputs(row.i);
      carryRnt = 0;
      continue;
    }

    const totalBottomTime = row.duration + carryRnt;
    const endingPressureGroup = lookupPG(row.depth, totalBottomTime);
    const ndl = lookupNDL(row.depth);
    const adjustedNdl = ndl - carryRnt;
    const ata = (row.depth / 33) + 1;
    const sacAdjusted = sacRate * ata;
    const gasCf = sacAdjusted * diveFactor * row.duration;
    const gasPsi = gasCf * (startingPressure / tankCapacity);
    remainingPressure -= gasPsi;

    let nextRnt = '';
    if (index < activeRows.length - 1) {
      const nextDepth = activeRows[index + 1].depth;
      if (nextDepth > 0) {
        nextRnt = lookupRNT(endingPressureGroup, nextDepth);
      }
    } else if (row.depth > 0) {
      nextRnt = lookupRNT(endingPressureGroup, row.depth);
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

window.calculate = calculate;
window.reset = reset;

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
  
  // Check for updates on startup
  checkForUpdate();
  setupUpdateBanner();
});

// Update system functions
async function checkForUpdate() {
  try {
    const result = await window.electronAPI.checkForUpdate();
    if (!result.hasUpdate) return;
    
    const updateBanner = document.getElementById('updateBanner');
    const updateBannerText = document.getElementById('updateBannerText');
    const mainContainer = document.getElementById('mainContainer');
    
    updateBannerText.textContent = `▲ Version ${result.version} available — click to download`;
    updateBanner.style.display = 'flex';
    mainContainer.classList.add('with-banner');
    
    // Click to open release page
    updateBannerText.onclick = () => { 
      window.electronAPI.openExternal(result.url); 
    };
  } catch (error) {
    // Update check failed silently
  }
}

function setupUpdateBanner() {
  const dismissBtn = document.getElementById('updateBannerDismiss');
  const updateBanner = document.getElementById('updateBanner');
  const mainContainer = document.getElementById('mainContainer');
  
  dismissBtn.onclick = () => {
    updateBanner.style.display = 'none';
    mainContainer.classList.remove('with-banner');
  };
}
