import OpenAI from 'npm:openai@4';

export interface SmartLayout {
    layout_style: {
        display: 'grid' | 'flex';
        flex_direction: 'column' | 'row' | 'column-reverse' | 'row-reverse';
        grid_template_columns: '1fr' | '1fr 1fr' | '2fr 1fr';
        gap_px: number;
        padding_px: number;
        background_color: string;
    };
    image_box: {
        order: number;
        border_style: 'solid' | 'dashed' | 'double' | 'none';
        border_color: string;
        border_width_px: number;
        border_radius_px: number;
        box_shadow: string;
    };
    text_box: {
        order: number;
        text_align: 'left' | 'center' | 'right';
        color: string;
        font_family: 'serif' | 'sans-serif';
    };
    page_style?: {
        section_order: ('highlights' | 'details' | 'team' | 'contact')[];
        section_gap_px: number;
        sections: Record<'highlights' | 'details' | 'team' | 'contact', {
            palette: 'light' | 'warm' | 'dark' | 'blue' | 'green';
            style: 'rounded' | 'outlined' | 'flat';
            columns: 1 | 2 | 3;
        }>;
    };
}

const systemPrompt = `你是一位精通現代網頁排版的 AI 視覺總監。請根據輸入的文字、圖片特徵與指令，設計出一套獨一無二的網頁排版樣式。
必須打破常規，根據指令嘗試「極簡留白」、「不對稱錯位」、「大膽撞色」等多元風格。
你必須且只能輸出一個符合以下格式的 JSON 對象，不要包含任何 Markdown 標記或前言：
{
  "layout_style": {
    "display": "grid" or "flex",
    "flex_direction": "column" or "row" or "column-reverse" or "row-reverse",
    "grid_template_columns": "1fr" or "1fr 1fr" or "2fr 1fr",
    "gap_px": number,
    "padding_px": number,
    "background_color": "Hex Color"
  },
  "image_box": {
    "order": number,
    "border_style": "solid" or "dashed" or "double" or "none",
    "border_color": "Hex Color",
    "border_width_px": number,
    "border_radius_px": number,
    "box_shadow": "string"
  },
  "text_box": {
    "order": number,
    "text_align": "left" or "center" or "right",
    "color": "Hex Color",
    "font_family": "serif" or "sans-serif"
  },
  "page_style": {
    "section_order": ["highlights", "details", "team", "contact"],
    "section_gap_px": number,
    "sections": {
      "highlights": {"palette": "light" or "warm" or "dark" or "blue" or "green", "style": "rounded" or "outlined" or "flat", "columns": 1 or 2 or 3},
      "details": {"palette": "light" or "warm" or "dark" or "blue" or "green", "style": "rounded" or "outlined" or "flat", "columns": 1 or 2 or 3},
      "team": {"palette": "light" or "warm" or "dark" or "blue" or "green", "style": "rounded" or "outlined" or "flat", "columns": 1 or 2 or 3},
      "contact": {"palette": "light" or "warm" or "dark" or "blue" or "green", "style": "rounded" or "outlined" or "flat", "columns": 1 or 2 or 3}
    }
  }
}`;

const standardLayout: SmartLayout = {
    layout_style: {
        display: 'flex', flex_direction: 'column', grid_template_columns: '1fr',
        gap_px: 24, padding_px: 24, background_color: '#ffffff'
    },
    image_box: {
        order: 0, border_style: 'none', border_color: '#ffffff',
        border_width_px: 0, border_radius_px: 16, box_shadow: 'none'
    },
    text_box: { order: 1, text_align: 'left', color: '#1f2937', font_family: 'sans-serif' },
    page_style: {
        section_order: ['highlights', 'details', 'team', 'contact'], section_gap_px: 24,
        sections: {
            highlights: { palette: 'light', style: 'rounded', columns: 3 },
            details: { palette: 'light', style: 'rounded', columns: 1 },
            team: { palette: 'light', style: 'rounded', columns: 3 },
            contact: { palette: 'light', style: 'rounded', columns: 2 }
        }
    }
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSmartLayout(value: unknown): value is SmartLayout {
    if (!isRecord(value) || !isRecord(value.layout_style) || !isRecord(value.image_box) || !isRecord(value.text_box)) return false;
    const layout = value.layout_style;
    const image = value.image_box;
    const text = value.text_box;
    const oneOf = (item: unknown, allowed: string[]) => typeof item === 'string' && allowed.includes(item);
    const integer = (item: unknown, min: number, max: number) => typeof item === 'number' && Number.isInteger(item) && item >= min && item <= max;
    const color = (item: unknown) => typeof item === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item);
    const shadow = (item: unknown) => typeof item === 'string' && (item === 'none' ||
        /^-?\d{1,2}px -?\d{1,2}px \d{1,2}px(?: \d{1,2}px)? #[0-9a-f]{6}$/i.test(item));
    const page = value.page_style;
    if (page !== undefined) {
        if (!isRecord(page) || !Array.isArray(page.section_order) || page.section_order.length !== 4 ||
            new Set(page.section_order).size !== 4 || !page.section_order.every(name => ['highlights', 'details', 'team', 'contact'].includes(name)) ||
            !integer(page.section_gap_px, 0, 80) || !isRecord(page.sections)) return false;
        for (const name of ['highlights', 'details', 'team', 'contact']) {
            const section = page.sections[name];
            if (!isRecord(section) || !oneOf(section.palette, ['light', 'warm', 'dark', 'blue', 'green']) ||
                !oneOf(section.style, ['rounded', 'outlined', 'flat']) || !integer(section.columns, 1, 3)) return false;
        }
    }
    return oneOf(layout.display, ['grid', 'flex']) &&
        oneOf(layout.flex_direction, ['column', 'row', 'column-reverse', 'row-reverse']) &&
        oneOf(layout.grid_template_columns, ['1fr', '1fr 1fr', '2fr 1fr']) &&
        integer(layout.gap_px, 0, 80) && integer(layout.padding_px, 0, 80) && color(layout.background_color) &&
        integer(image.order, 0, 1) && oneOf(image.border_style, ['solid', 'dashed', 'double', 'none']) &&
        color(image.border_color) && integer(image.border_width_px, 0, 12) &&
        integer(image.border_radius_px, 0, 80) && shadow(image.box_shadow) &&
        integer(text.order, 0, 1) && image.order !== text.order &&
        oneOf(text.text_align, ['left', 'center', 'right']) && color(text.color) &&
        oneOf(text.font_family, ['serif', 'sans-serif']);
}

export async function generateLayout(
    text: string,
    imageColors: string[],
    imageRatio: string,
    userInstruction: string
): Promise<{ layout: SmartLayout; usedFallback: boolean }> {
    try {
        const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
        const model = Deno.env.get('OPENAI_MODEL')?.trim();
        if (!apiKey || !model) throw new Error('智慧排版尚未設定 AI 金鑰或模型。');
        const baseURL = (Deno.env.get('OPENAI_BASE_URL')?.trim() || 'https://api.openai.com/v1')
            .replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
        const client = new OpenAI({ apiKey, baseURL, timeout: 30000, maxRetries: 0 });
        const result = await client.chat.completions.create({
            model,
            temperature: 0.85,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: `${systemPrompt}\npage_style 必須包含四個區塊且順序不可重複；details 的 columns 固定為 1。只設計排版，不改寫文字或圖片。顏色必須使用 #RGB 或 #RRGGBB。尺寸必須是整數：gap_px、padding_px、border_radius_px、section_gap_px 為 0 至 80，border_width_px 為 0 至 12。兩個 order 分別為 0 和 1。box_shadow 只能是 none 或「0px 4px 12px #000000」形式。` },
                { role: 'user', content: JSON.stringify({ text, imageColors, imageRatio, userInstruction }) }
            ]
        });
        const content = result.choices[0]?.message?.content;
        if (!content) throw new Error('AI 沒有回傳排版。');
        const layout: unknown = JSON.parse(content);
        if (!isSmartLayout(layout) || !layout.page_style) {
            if (isRecord(layout)) {
                console.error('Smart layout validation field names:', Object.keys(layout),
                    isRecord(layout.page_style) ? Object.keys(layout.page_style) : 'no page_style');
            }
            throw new Error('AI 回傳的完整頁面排版格式不符合安全限制。');
        }
        return { layout, usedFallback: false };
    } catch (error) {
        console.error('Smart layout generation failed:', error instanceof Error ? error.message : 'unknown error');
        return { layout: structuredClone(standardLayout), usedFallback: true };
    }
}
