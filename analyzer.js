import { ACTIONS } from './data.js';

// ===== 全局状态 =====
export let poseResults = null;
export let isPoseReady = false;

// ===== 角度计算 =====
export function calculateAngle(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z||0) - (b.z||0) };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z||0) - (b.z||0) };
    const dot = v1.x*v2.x + v1.y*v2.y + v1.z*v2.z;
    const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y + v1.z*v1.z);
    const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y + v2.z*v2.z);
    if(mag1 === 0 || mag2 === 0) return 0;
    return Math.acos(Math.min(1, Math.max(-1, dot / (mag1 * mag2)))) * 180 / Math.PI;
}

// ===== 分析单帧姿态指标 =====
function analyzeFrameMetrics(landmarks) {
    if(!landmarks || landmarks.length < 33) return null;
    const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];
    const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];
    const rHip = landmarks[24], lHip = landmarks[23];

    let hitHeight = 0;
    if(rWrist && rWrist.visibility > 0.5) hitHeight = 1 - rWrist.y;
    else if(lWrist && lWrist.visibility > 0.5) hitHeight = 1 - lWrist.y;

    let sideBody = 0;
    if(rShoulder && lShoulder && rShoulder.visibility > 0.5 && lShoulder.visibility > 0.5) {
        sideBody = Math.abs(rShoulder.x - lShoulder.x);
    }

    let elbowAngle = 0;
    if(rShoulder && rElbow && rWrist && rShoulder.visibility>0.5 && rElbow.visibility>0.5 && rWrist.visibility>0.5) {
        elbowAngle = calculateAngle(rShoulder, rElbow, rWrist);
    } else if(lShoulder && lElbow && lWrist && lShoulder.visibility>0.5 && lElbow.visibility>0.5 && lWrist.visibility>0.5) {
        elbowAngle = calculateAngle(lShoulder, lElbow, lWrist);
    }

    let stability = 1;
    if(rHip && lHip && rHip.visibility > 0.5 && lHip.visibility > 0.5) {
        stability = 1 - Math.abs(rHip.y - lHip.y) * 5;
        stability = Math.max(0, Math.min(1, stability));
    }

    return { hitHeight, sideBody, elbowAngle, stability };
}

// ===== 计算综合评分与等级 =====
export function computeLevel(metricsList) {
    if(metricsList.length === 0) return { level: 1, normScore: 0, stabScore: 0, finalScore: 0, metrics: { hitScore: 0, sideScore: 0, elbowScore: 0, stabMetric: 0 } };

    const avgHitHeight = metricsList.reduce((s,m) => s + m.hitHeight, 0) / metricsList.length;
    const avgSideBody = metricsList.reduce((s,m) => s + m.sideBody, 0) / metricsList.length;
    const avgElbowAngle = metricsList.reduce((s,m) => s + m.elbowAngle, 0) / metricsList.length;
    const avgStability = metricsList.reduce((s,m) => s + m.stability, 0) / metricsList.length;

    const varElbow = metricsList.reduce((s,m) => s + Math.pow(m.elbowAngle - avgElbowAngle, 2), 0) / metricsList.length;
    const varHit = metricsList.reduce((s,m) => s + Math.pow(m.hitHeight - avgHitHeight, 2), 0) / metricsList.length;

    const hitScore = Math.min(100, Math.max(0, (avgHitHeight - 0.3) / 0.5 * 100));
    const sideScore = Math.min(100, Math.max(0, (avgSideBody - 0.02) / 0.15 * 100));
    const elbowScore = avgElbowAngle >= 140 ? 100 : avgElbowAngle >= 120 ? 75 : avgElbowAngle >= 90 ? 50 : 25;
    const stabMetric = avgStability * 100;

    const normScore = Math.round(hitScore * 0.3 + sideScore * 0.2 + elbowScore * 0.3 + stabMetric * 0.2);
    const elbowVarScore = Math.max(0, 100 - varElbow * 0.5);
    const hitVarScore = Math.max(0, 100 - varHit * 2000);
    const stabScore = Math.round(elbowVarScore * 0.6 + hitVarScore * 0.4);
    const finalScore = Math.round(normScore * 0.6 + stabScore * 0.4);
    const level = Math.min(6, Math.max(1, Math.floor(finalScore / 15) + 1));

    return {
        level, normScore, stabScore, finalScore,
        metrics: { hitScore: Math.round(hitScore), sideScore: Math.round(sideScore), elbowScore, stabMetric: Math.round(stabMetric) }
    };
}

// ===== MediaPipe 初始化 =====
let _uploadPoseResolve = null;

function setupUploadPoseCallback(poseInstance) {
    poseInstance.onResults((results) => {
        if(_uploadPoseResolve) {
            _uploadPoseResolve(results.poseLandmarks || null);
        }
    });
}

function analyzeFrameWithPose(videoEl, poseInstance) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => { _uploadPoseResolve = null; resolve(null); }, 3000);
        _uploadPoseResolve = (landmarks) => {
            clearTimeout(timeout);
            _uploadPoseResolve = null;
            resolve(landmarks);
        };
        try { poseInstance.send({ image: videoEl }); }
        catch(e) { clearTimeout(timeout); _uploadPoseResolve = null; resolve(null); }
    });
}

export function initMediaPipe(videoElement, canvasElement, statusElement) {
    const ctx = canvasElement.getContext('2d');

    function onResults(results) {
        canvasElement.width = videoElement.videoWidth || 640;
        canvasElement.height = videoElement.videoHeight || 480;
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        if(results.poseLandmarks) {
            poseResults = results.poseLandmarks;
            isPoseReady = true;
            statusElement.textContent = '✅ 已检测到人体';
            statusElement.style.display = 'block';
            drawSkeleton(ctx, results.poseLandmarks, canvasElement.width, canvasElement.height);
        } else {
            isPoseReady = false;
            statusElement.textContent = '⏳ 请站入框内';
            statusElement.style.display = 'block';
        }
    }

    try {
        const pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        pose.onResults(onResults);

        const camera = new Camera(videoElement, {
            onFrame: async () => { await pose.send({image: videoElement}); },
            width: 640, height: 480
        });
        camera.start().then(() => {
            statusElement.textContent = '📷 AI模型加载中...';
            statusElement.style.display = 'block';
        }).catch(e => {
            statusElement.textContent = '❌ 摄像头启动失败';
            statusElement.style.display = 'block';
            console.error(e);
        });
    } catch(e) {
        statusElement.textContent = '❌ AI模型加载失败';
        statusElement.style.display = 'block';
        console.error(e);
    }
}

function drawSkeleton(ctx, landmarks, w, h) {
    const connections = [[11,12],[11,23],[12,24],[23,24],[23,25],[24,26],[11,13],[13,15],[12,14],[14,16],[15,17],[16,18],[15,19],[16,20]];
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    connections.forEach(([i,j]) => {
        const p1 = landmarks[i], p2 = landmarks[j];
        if(p1?.visibility > 0.5 && p2?.visibility > 0.5) {
            ctx.beginPath();
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);
            ctx.stroke();
        }
    });
    landmarks.forEach(l => {
        if(l.visibility > 0.5) {
            ctx.beginPath();
            ctx.arc(l.x * w, l.y * h, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff3333';
            ctx.fill();
        }
    });
}

// ===== 上传视频帧分析（返回 landmarks 数组） =====
export async function extractPoseFromVideo(videoElement, frameCount, onProgress) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    // 创建独立的 Pose 实例用于视频分析
    let uploadPose = null;
    try {
        uploadPose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        uploadPose.setOptions({ modelComplexity: 1, smoothLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        setupUploadPoseCallback(uploadPose);
    } catch(e) {
        console.error('Upload Pose init error:', e);
        return [];
    }

    const duration = videoElement.duration || 10;
    const maxTime = Math.min(duration, 5);
    const results = [];

    for(let i = 0; i < frameCount; i++) {
        const time = (i / frameCount) * maxTime;
        videoElement.currentTime = time;
        await new Promise(r => { let done=false; const once=()=>{if(!done){done=true;r();}}; videoElement.onseeked=once; setTimeout(once, 2000); });

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        const landmarks = await analyzeFrameWithPose(videoElement, uploadPose);
        if(landmarks) results.push(landmarks);

        if(onProgress) onProgress(i + 1, frameCount);
    }

    return results;
}

// ===== 训练计划 =====
export function getTrainingPlan(level) {
    const plans = {
        1: '每日练习：正手握拍转换 × 50次，徒手挥拍 × 100次，对墙颠球 × 10分钟。',
        2: '每日练习：正手高远球挥拍 × 150次，步伐并步练习 × 5组，网前挑球 × 50次。',
        3: '隔日练习：高远球对打 × 20分钟，反手过渡网前 × 50次，交叉步全场跑位 × 10组。',
        4: '隔日练习：反手高远球 × 50次，全场步法跑位 × 15组，吊球练习 × 30次。',
        5: '隔日练习：网前搓球勾对角 × 50次，杀球落点练习 × 30次，战术对抗赛 × 30分钟。',
        6: '保持训练：多球训练 × 30分钟，实战对抗 × 1小时，体能训练 × 20分钟。'
    };
    return plans[level] || plans[1];
}
