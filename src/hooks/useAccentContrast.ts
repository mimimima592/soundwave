import { useMemo } from 'react';

/**
 * Вычисляет яркость цвета из RGB значений
 * Возвращает значение от 0 (черный) до 255 (белый)
 */
function getBrightness(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Хук для определения контрастного цвета текста/иконок на акцентном фоне
 * Использует CSS переменные темы для получения адаптивных цветов
 */
export function useAccentContrast() {
  const contrastColor = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    
    // Получаем значения акцентного цвета и контрастных цветов из темы
    const accentVar = style.getPropertyValue('--theme-accent').trim();
    const onAccentVar = style.getPropertyValue('--theme-on-accent').trim();
    
    // Если тема уже определяет контрастный цвет, используем его
    if (onAccentVar) {
      return `rgb(${onAccentVar})`;
    }
    
    // Иначе вычисляем на основе яркости акцентного цвета
    if (accentVar) {
      const [r, g, b] = accentVar.split(' ').map(Number);
      const brightness = getBrightness(r, g, b);
      
      // Если акцент светлый (> 128), используем темный цвет
      // Если акцент темный (< 128), используем светлый цвет
      if (brightness > 128) {
        // Для светлых акцентов используем не чистый черный, а темно-серый
        // который лучше смотрится с цветными акцентами
        return 'rgb(20 20 25)';
      } else {
        // Для темных акцентов используем белый
        return 'rgb(255 255 255)';
      }
    }
    
    // Fallback
    return 'rgb(255 255 255)';
  }, []);

  return { contrastColor };
}
