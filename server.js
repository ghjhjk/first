const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// 데이터 파일 읽기/쓰기
function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 이메일 발송 함수 (테스트용 Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ddrsanztv@gmail.com', // 본인 Gmail
    pass: '1234'     // 앱 비밀번호
  }
});

// WebSocket 서버
const wss = new WebSocketServer({ port: 3001 });
function broadcast(msg) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(msg));
  });
}

// 신청 저장
app.post('/api/apply', (req, res) => {
  const { depositor, email, amount, coinType, network, wallet, memo } = req.body;
  if (!depositor || !amount || !coinType || !network || !wallet) {
    return res.json({ success: false, error: '필수 항목 누락' });
  }
  const data = readData();
  const createdAt = new Date().toISOString();
  const status = '신청';
  const item = { depositor, email, amount, coinType, network, wallet, memo, status, createdAt };
  data.push(item);
  writeData(data);

  // 이메일 발송 (입력 시)
  if (email) {
    transporter.sendMail({
      from: 'your_gmail@gmail.com',
      to: email,
      subject: '[코인매입] 신청 내역 안내',
      text: `신청자: ${depositor}\n금액: ${amount} KRW\n코인: ${coinType}\n네트워크: ${network}\n지갑주소: ${wallet}\n메모: ${memo || '-'}\n신청일시: ${createdAt}`
    }, (err, info) => {});
  }

  // 실시간 알림
  broadcast({ type: 'status-update', status: '신청', wallet });

  res.json({ success: true });
});

// 신청 전체 조회
app.get('/api/apply', (req, res) => {
  res.json(readData());
});

// 신청 상태 변경 (수정)
app.patch('/api/apply', (req, res) => {
  const { wallet, status } = req.body;
  if (!wallet || !status) return res.json({ success: false, error: '필수 항목 누락' });
  const data = readData();
  const idx = data.findIndex(x => x.wallet === wallet);
  if (idx === -1) return res.json({ success: false, error: '신청 내역 없음' });
  data[idx].status = status;
  writeData(data);
  broadcast({ type: 'status-update', status, wallet });
  res.json({ success: true });
});

// 신청 삭제(취소)
app.delete('/api/apply', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.json({ success: false, error: '필수 항목 누락' });
  let data = readData();
  const before = data.length;
  data = data.filter(x => x.wallet !== wallet);
  writeData(data);
  if (data.length === before) return res.json({ success: false, error: '신청 내역 없음' });
  broadcast({ type: 'status-update', status: '취소', wallet });
  res.json({ success: true });
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`API 서버 실행: http://localhost:${PORT}`);
});
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello', msg: 'WebSocket 연결됨' }));
}); 