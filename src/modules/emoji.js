export function fixEmoji(str) {
    if (typeof str !== 'string') return str;

    return str
        .replace(/\uFFFD/g, '')
        .replace(/�\s*\uFE0F?/g, '')
        .replace(/⚠\s*\uFFFD\s*\uFE0F?/g, '⚠️')
        .replace(/ℹ\s*\uFFFD\s*\uFE0F?/g, 'ℹ️')
        .replace(/🗑\s*\uFFFD\s*\uFE0F?/g, '🗑️')
        .replace(/⬇\s*\uFFFD\s*\uFE0F?/g, '⬇️')
        .replace(/🖼\s*\uFFFD\s*\uFE0F?/g, '🖼️')
        .replace(/📦\s*\uFFFD\s*\uFE0F?/g, '📦')
        .replace(/🔌\s*\uFFFD\s*\uFE0F?/g, '🔌')
        .replace(/✅\s*\uFFFD\s*\uFE0F?/g, '✅')
        .replace(/❌\s*\uFFFD\s*\uFE0F?/g, '❌');
}

export function logWithEmoji(consoleFn, prefix, ...args) {
    const msg = fixEmoji(prefix);
    consoleFn(msg, ...args);
}
