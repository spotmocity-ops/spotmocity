(function () {
    function isSmartLayout(value) {
        const record = item => item && typeof item === 'object' && !Array.isArray(item);
        if (!record(value) || !record(value.layout_style) || !record(value.image_box) || !record(value.text_box)) return false;
        const layout = value.layout_style;
        const image = value.image_box;
        const text = value.text_box;
        const oneOf = (item, allowed) => typeof item === 'string' && allowed.includes(item);
        const integer = (item, min, max) => Number.isInteger(item) && item >= min && item <= max;
        const color = item => typeof item === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item);
        const shadow = item => typeof item === 'string' && (item === 'none' ||
            /^-?\d{1,2}px -?\d{1,2}px \d{1,2}px(?: \d{1,2}px)? #[0-9a-f]{6}$/i.test(item));
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

    window.isSmartLayout = isSmartLayout;
})();
