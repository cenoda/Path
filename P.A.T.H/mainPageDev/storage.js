const StorageManager = {
    // 초기 데이터 설정
    defaults: {
        gold: 0,
        exp: 0,
        tier: "BRONZE",
        rankPct: 99.9
    },

    // 데이터 불러오기
    load() {
        const saved = localStorage.getItem('PATH_USER_DATA');
        return saved ? JSON.parse(saved) : this.defaults;
    },

    // 데이터 저장하기
    save(data) {
        localStorage.setItem('PATH_USER_DATA', JSON.stringify(data));
    },

    // 보상 합산
    addRewards(earnedGold, earnedExp) {
        const data = this.load();
        data.gold += earnedGold;
        data.exp += earnedExp;
        
        // 티어 계산 로직 (간단 예시: 누적 EXP 기준)
        if (data.exp > 10000) data.tier = "CHALLENGER";
        else if (data.exp > 5000) data.tier = "DIAMOND";
        else if (data.exp > 1000) data.tier = "GOLD";
        
        this.save(data);
        return data;
    }
};
