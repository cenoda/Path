function bindTapAction(handler) {
    return function(event) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
    };
}

function bindMainHubSettingsPanelControls() {
    // Keep inline onchange handlers intact and do not bind change listeners
}

async function saveCamSettings(settings) {
    const response = await fetch('/api/saveCamSettings', { method: 'POST', body: JSON.stringify(settings) });
    if (!response.ok) {
        throw new Error('저장 실패. 다시 시도해주세요.');
    }
    // On success
    const resetNoteText = '선택한 공개 범위에 따라 표시됩니다.';
}