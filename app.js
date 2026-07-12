import { ACTIONS, VIDEO_DATA } from './data.js';
import { poseResults, isPoseReady, initMediaPipe, computeLevel, extractPoseFromVideo, getTrainingPlan, analyzeFrameMetrics } from './analyzer.js';

// ===== 全局状态 =====
let curAction = null;
let selectedFile = null;
let savedScrollY = 0;
let camInitialized = false;

// ===== DOM 引用 =====
const $ = id => document.getElementById(id);

// ===== 导航切换 =====
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    const target = $(id);
    if(target) target.classList.add('active');
    const map = { home: 0, camera: 1, upload: 2 };
    const btns = document.querySelectorAll('.nav button');
    if(btns[map[id]]) btns[map[id]].classList.add('active');
    if(id === 'home' && savedScrollY) {
        setTimeout(() => window.scrollTo(0, savedScrollY), 50);
        savedScrollY = 0;
    }
    if(id === 'camera') startCamera();
}
window.showPage = showPage;

// ===== 渲染首页 =====
function renderHome() {
    const cats = {};
    ACTIONS.forEach(a => { if(!cats[a.category]) cats[a.category]=[]; cats[a.category].push(a); });
    let html = '';
    for(const [cat, acts] of Object.entries(cats)) {
        html += `<div class="category-block">
            <div class="category-title">${cat}</div>
            <div class="action-grid">
                ${acts.map(a => `<div class="action-card" onclick="showDetail(${a.id})">
                    <div class="name">${a.name}</div>
                    <div class="desc">${a.description}</div>
                    <div class="stars">${'★'.repeat(a.difficulty)}${'☆'.repeat(5-a.difficulty)}</div>
                </div>`).join('')}
            </div>
        </div>`;
    }
    $('home').innerHTML = html;
}

// ===== 详情页 =====
window.showDetail = function(id) {
    savedScrollY = window.scrollY;
    curAction = ACTIONS.find(a => a.id === id);
    if(!curAction) return;
    const v = VIDEO_DATA[curAction.name] || {};
    let html = `
    <button class="back-btn" onclick="showPage('home')">← 返回列表</button>
    <div class="detail-hero">
        <h2>${curAction.name}</h2>
        <div class="cat">${curAction.category} | 难度 ${'★'.repeat(curAction.difficulty)}</div>
    </div>
    <div class="video-section">
        <div class="video-wrapper">
            <iframe src="https://player.bilibili.com/player.html?bvid=${v.bvid||'BV1FacXzKEsC'}&autoplay=0" scrolling="no" frameborder="0" allowfullscreen></iframe>
        </div>
        <div class="video-tip">💡 <b>要点：</b>${v.tip||'观看视频学习动作要领'}</div>
    </div>
    <div class="content-card"><h3>📋 动作步骤</h3><ul>${curAction.steps.map((s,i)=>`<li class="step-li"><span class="step-num">${i+1}</span>${s}</li>`).join('')}</ul></div>
    <div class="content-card"><h3>⚠️ 常见错误</h3><ul>${curAction.mistakes.map(m=>`<li class="error-li">${m}</li>`).join('')}</ul></div>
    <div class="content-card"><h3>💡 练习要点</h3><ul>${curAction.tips.map(t=>`<li class="tip-li">${t}</li>`).join('')}</ul></div>
    <div class="content-card" style="background:linear-gradient(135deg,#e8f0fe,#f0f7ff);border-left:4px solid var(--primary);">
        <h3>🎓 教练讲解</h3>
        <p style="line-height:1.8;color:#333;">${curAction.narration}</p>
    </div>
    <div class="practice-btns">
        <button class="btn-cam" onclick="goCamera(${id})">📷 摄像头分析</button>
        <button class="btn-upload" onclick="goUpload(${id})">📤 上传视频</button>
    </div>`;
    $('detail').innerHTML = html;
    showPage('detail');
};

window.goCamera = (id) => { $('cam-select').value = id; showPage('camera'); };
window.goUpload = (id) => { $('upload-select').value = id; showPage('upload'); };

// ===== 下拉框 =====
function renderSelects() {
    const opts = ACTIONS.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    $('cam-select').innerHTML = '<option value="">选择动作...</option>' + opts;
    $('upload-select').innerHTML = '<option value="">选择动作类型...</option>' + opts;
}

// ===== 摄像头 =====
async function startCamera() {
    if(camInitialized) return;
    camInitialized = true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        const video = $('cam-video');
        video.srcObject = stream;
        await video.play();
        initMediaPipe(video, $('cam-canvas'), $('cam-status'));
    } catch(e) {
        camInitialized = false;
        alert('摄像头权限被拒绝，请在设置中允许');
        console.error(e);
    }
}

// ===== 拍照分析 =====
window.captureFrame = async function() {
    const video = $('cam-video');
    const box = $('cam-result');
    box.style.display = 'block';
    box.innerHTML = '<p style="text-align:center;color:var(--primary);">🔍 分析中...</p><div class="progress-wrap"><div class="progress-bar"></div></div>';

    await new Promise(r => setTimeout(r, 2000));

    const metrics = [];
    if(poseResults) {
        const m = analyzeFrameMetrics(poseResults);
        if(m) metrics.push(m);
    }

    const result = computeLevel(metrics);
    const levelMap = ['', '入门', '初级', '业余合格', '业余中坚', '业余高手', '业余顶尖'];
    const cardClass = `level-card-lv${Math.min(result.level, 6)}`;

    let html = `
        <div class="level-card ${cardClass}">
            <div class="level-label">中羽等级评估</div>
            <div class="level-badge">🏅 ${result.level}</div>
            <div class="level-name">${levelMap[result.level] || ''}</div>
            <div style="opacity:0.8;font-size:14px;">综合分 ${result.finalScore}</div>
        </div>
        <div class="radar-box">
            <div style="font-weight:bold;margin-bottom:12px;">📊 三维度评估</div>
            ${[
                { label: '技术规范性', val: result.normScore, color: '#1a73e8' },
                { label: '动作稳定性', val: result.stabScore, color: '#2e7d32' },
                { label: '步法移动', val: result.metrics.stabMetric, color: '#f5a623' }
            ].map(r => `<div class="radar-item"><span class="radar-label">${r.label}</span><div class="radar-track"><div class="radar-fill" style="width:${r.val}%;background:${r.color};"></div></div><span class="radar-val">${r.val}</span></div>`).join('')}
        </div>
        <div class="fb-item"><span class="fb-icon ok">📐</span><b>击球点：</b>${result.metrics.hitScore} · <b>侧身：</b>${result.metrics.sideScore} · <b>发力：</b>${result.metrics.elbowScore}</div>
        <div class="fb-item" style="background:#fff3e0;"><span class="fb-icon warn">💬</span>当前为摄像头单帧分析，上传视频可获得更准确的评估。</div>
        <button class="train-btn" onclick="showTrainingPlan(${result.level})">📋 生成训练计划</button>
    `;
    box.innerHTML = html;
};

// ===== 上传视频分析 =====
let uploadRunning = false;
window.uploadVideo = async function() {
    if(!selectedFile || uploadRunning) return;
    uploadRunning = true;
    const sel = $('upload-select').value;
    const action = sel ? ACTIONS.find(a=>a.id==sel) : null;
    const actionName = action ? action.name : '正手高远球';

    const box = $('upload-result');
    box.style.display = 'block';
    $('upload-btn').textContent = '分析中...';
    $('upload-btn').disabled = true;

    box.innerHTML = '<p style="text-align:center;color:var(--primary);" id="upload-status">正在准备姿态分析...</p>'
        + '<div class="progress-wrap"><div class="progress-bar" id="upload-bar" style="width:0%;animation:none;"></div></div>'
        + '<p style="text-align:center;color:#999;font-size:13px;margin-top:6px;" id="upload-pct">0%</p>';

    const bar = $('upload-bar');
    const pctEl = $('upload-pct');
    const statusEl = $('upload-status');
    function setProgress(pct, text) {
        bar.style.width = pct + '%';
        pctEl.textContent = pct + '%';
        if(text) statusEl.textContent = text;
    }

    // 创建临时 video
    const video = document.createElement('video');
    video.src = URL.createObjectURL(selectedFile);
    video.muted = true;
    video.preload = 'auto';

    try {
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = () => reject(new Error('视频加载失败'));
        });
    } catch(e) {
        box.innerHTML = '<p style="text-align:center;color:#e53935;">❌ 视频加载失败，请确认文件格式正确</p>';
        $('upload-btn').textContent = '🔍 开始分析';
        $('upload-btn').disabled = false;
        uploadRunning = false;
        return;
    }

    setProgress(5, '正在加载AI姿态模型...');

    // 创建共享的 Pose 实例（只加载一次模型）
    let uploadPose = null;
    try {
        uploadPose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        uploadPose.setOptions({ modelComplexity: 1, smoothLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    } catch(e) {
        box.innerHTML = '<p style="text-align:center;color:#e53935;">❌ AI模型加载失败，请刷新重试</p>';
        $('upload-btn').textContent = '🔍 开始分析';
        $('upload-btn').disabled = false;
        uploadRunning = false;
        return;
    }

    // 共享回调：每次 send 后通过 Promise 返回 landmarks
    let _poseResolve = null;
    uploadPose.onResults((results) => {
        if(_poseResolve) {
            _poseResolve(results.poseLandmarks || null);
            _poseResolve = null;
        }
    });

    function sendFrame(videoEl) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => { _poseResolve = null; resolve(null); }, 5000);
            _poseResolve = (landmarks) => {
                clearTimeout(timeout);
                resolve(landmarks);
            };
            uploadPose.send({ image: videoEl }).catch(() => {
                clearTimeout(timeout);
                _poseResolve = null;
                resolve(null);
            });
        });
    }

    // 逐帧分析
    const frameCount = 10;
    const allMetrics = [];

    for(let i = 0; i < frameCount; i++) {
        const pct = Math.round(((i) / frameCount) * 85) + 10;
        setProgress(pct, `正在分析第 ${i+1}/${frameCount} 帧...`);

        const duration = video.duration || 10;
        const time = (i / frameCount) * Math.min(duration, 5);
        video.currentTime = time;
        await new Promise(r => { let done=false; const once=()=>{if(!done){done=true;r();}}; video.onseeked=once; setTimeout(once, 2000); });

        // 发送帧给共享 Pose 实例
        const landmarks = await sendFrame(video);

        if(landmarks) {
            const m = analyzeFrameMetrics(landmarks);
            if(m) allMetrics.push(m);
        }
    }

    URL.revokeObjectURL(video.src);
    setProgress(95, '正在计算等级...');
    await new Promise(r => setTimeout(r, 300));

    const result = computeLevel(allMetrics);
    setProgress(100, '分析完成！');
    await new Promise(r => setTimeout(r, 300));

    const levelMap = ['', '入门', '初级', '业余合格', '业余中坚', '业余高手', '业余顶尖'];
    const cardClass = `level-card-lv${Math.min(result.level, 6)}`;

    let html = `
        <div class="level-card ${cardClass}">
            <div class="level-label">中羽等级评估</div>
            <div class="level-badge">🏅 ${result.level}</div>
            <div class="level-name">${levelMap[result.level] || ''}</div>
            <div style="opacity:0.8;font-size:14px;">综合分 ${result.finalScore}</div>
        </div>
        <div class="radar-box">
            <div style="font-weight:bold;margin-bottom:12px;">📊 三维度评估</div>
            ${[
                { label: '技术规范性', val: result.normScore, color: '#1a73e8' },
                { label: '动作稳定性', val: result.stabScore, color: '#2e7d32' },
                { label: '步法移动', val: result.metrics.stabMetric, color: '#f5a623' }
            ].map(r => `<div class="radar-item"><span class="radar-label">${r.label}</span><div class="radar-track"><div class="radar-fill" style="width:${r.val}%;background:${r.color};"></div></div><span class="radar-val">${r.val}</span></div>`).join('')}
        </div>
        <div class="fb-item"><span class="fb-icon ok">📐</span><b>击球点高度分：</b>${result.metrics.hitScore} · <b>侧身程度分：</b>${result.metrics.sideScore} · <b>发力规范分：</b>${result.metrics.elbowScore}</div>
    `;

    // 一句话总结
    let summary = '';
    if(result.level <= 2) summary = '当前处于入门阶段，建议先从握拍和正手高远球基础动作练起。';
    else if(result.level === 3) summary = `你的${actionName}有一定基础，但动作规范性和稳定性还需要提升。`;
    else if(result.level === 4) summary = `你的${actionName}发力框架已基本稳定，建议加强反手和步法练习。`;
    else if(result.level === 5) summary = `你的${actionName}动作规范，稳定性好，可通过提升战术意识继续进步。`;
    else summary = `你的${actionName}技术接近专业水准，保持训练强度，注重比赛实战。`;

    if(result.normScore < 60) summary += ' 规范性是当前最大短板，建议对照教学视频逐帧纠正动作。';
    else if(result.stabScore < 60) summary += ' 动作稳定性不足，建议多做重复性挥拍练习固化肌肉记忆。';

    html += `<div class="fb-item" style="background:#fff3e0;"><span class="fb-icon warn">💬</span><b>总结：</b>${summary}</div>`;
    html += `<div style="margin-top:12px;font-size:0.9em;color:#666;">✅ 已分析 ${allMetrics.length} 帧</div>`;
    html += `<button class="train-btn" onclick="showTrainingPlan(${result.level})">📋 生成训练计划</button>`;

    box.innerHTML = html;
    $('upload-btn').textContent = '🔍 开始分析';
    $('upload-btn').disabled = false;
    uploadRunning = false;
};

// ===== 训练计划弹窗 =====
window.showTrainingPlan = function(level) {
    const plan = getTrainingPlan(level);
    alert(`📋 中羽 ${level} 级训练计划\n\n${plan}\n\n💡 建议配合教练指导，循序渐进提升。`);
};

// ===== 文件上传 =====
window.handleFile = function(e) {
    selectedFile = e.target.files[0];
    if(selectedFile) {
        const v = $('preview-video');
        v.src = URL.createObjectURL(selectedFile);
        v.style.display = 'block';
        $('upload-btn').disabled = false;
    }
};

// ===== 初始化 =====
renderHome();
renderSelects();
console.log('🏸 羽毛球AI教练 v2.0 已启动');
