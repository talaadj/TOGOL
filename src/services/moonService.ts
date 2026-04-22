import SunCalc from 'suncalc';

export interface MoonData {
  phase: number;
  illumination: number;
  lunarDay: number;
  name: string;
  iconName: string;
}

// Local calculation using SunCalc
export const calculateMoonDataLocally = (date: Date): MoonData => {
  const moonIllumination = SunCalc.getMoonIllumination(date);
  const phase = moonIllumination.phase; // 0 to 1
  const illumination = moonIllumination.fraction;

  // Calculate Lunar Day (1-30)
  // phase goes from 0 (new moon) to 0.5 (full moon) to 1 (new moon)
  let lunarDay = Math.floor(phase * 29.53) + 1;
  if (lunarDay > 30) lunarDay = 30;

  let name = '';
  if (phase < 0.03 || phase > 0.97) name = 'Новолуние';
  else if (phase < 0.22) name = 'Растущий серп';
  else if (phase < 0.28) name = 'Первая четверть';
  else if (phase < 0.47) name = 'Растущая луна';
  else if (phase < 0.53) name = 'Полнолуние';
  else if (phase < 0.72) name = 'Убывающая луна';
  else if (phase < 0.78) name = 'Последняя четверть';
  else name = 'Старая луна';

  return {
    phase,
    illumination,
    lunarDay,
    name,
    iconName: 'Moon'
  };
};

export const fetchMoonData = async (date: Date): Promise<MoonData> => {
  try {
    const timestamp = Math.floor(date.getTime() / 1000);
    // Farmsense API is a public keyless API often used for moon phases
    const response = await fetch(`https://api.farmsense.net/v1/moonphases/?d=${timestamp}`);
    
    if (!response.ok) throw new Error('API request failed');
    
    const data = await response.json();
    
    if (data && data[0]) {
      const apiData = data[0];
      return {
        phase: apiData.Index, // They use Index for phase fraction
        illumination: apiData.Illumination || 0,
        lunarDay: Math.floor(apiData.Age) || Math.floor(apiData.Index * 29.53) + 1,
        name: apiData.Phase,
        iconName: 'Moon'
      };
    }
    throw new Error('Invalid data format');
  } catch (error) {
    console.warn("Lunar API failed, falling back to local calculation:", error);
    return calculateMoonDataLocally(date);
  }
};

// Renaming for consistency with previous turn expectations if needed, 
// but keeping the local one for fast calendar rendering.
export const getMoonData = calculateMoonDataLocally;
