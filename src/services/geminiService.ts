import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export interface AISummaryParams {
  date: string;
  muchol: string;
  togool: string;
  amal: string | null;
  prediction: {
    rain: number;
    snow: number;
    wind: number;
    confidence: number;
    confidenceReason: string;
    summary: string;
  };
  liveWeather?: {
    temp: number;
    humidity: number;
    pressure: number;
    city: string;
  } | null;
  observations: string[];
}

export async function generateWeatherInsight(params: AISummaryParams): Promise<string> {
  const prompt = `
    Вы — эксперт "Эсепчи" (традиционный киргизский метеоролог-астроном) и современный ИИ-помощник. 
    Синтезируйте следующие данные прогноза погоды, полученные методом Сарыгулова, и текущие данные в краткое, 
    проницательное резюме (2-3 предложения) на русском языке. 
    Используйте сочетание традиционной мудрости и современной ясности.

    Данные для анализа:
    - Дата: ${params.date}
    - Контекст Мучол: год ${params.muchol}
    - Цикл Тогоол: ${params.togool}
    - Период Амал: ${params.amal || 'Нет активного Амала'}
    - Прогноз Сарыгулова: Осадки ${params.prediction.rain}% (Дождь) / ${params.prediction.snow}% (Снег), Ветер ${params.prediction.wind}%
    - Достоверность: ${params.prediction.confidence}% (${params.prediction.confidenceReason})
    - Живая погода (сейчас): ${params.liveWeather ? `Темп ${Math.round(params.liveWeather.temp)}°C, Влажность ${params.liveWeather.humidity}%` : 'Данные недоступны'}
    - Записанные наблюдения за этот день: ${params.observations.length > 0 ? params.observations.join(', ') : 'Наблюдений нет'}

    Ваша задача: Дать глубокую интерпретацию этого сочетания. Если приметы подтверждают Тогоол, подчеркните это. 
    Если живая погода отклоняется от "кода" месяца, дайте краткое пояснение.
    Ответьте только текстом резюме, без вступлений.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Не удалось получить интерпретацию ИИ.";
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Ошибка при генерации ИИ-анализа. Проверьте соединение или настройки API.";
  }
}
