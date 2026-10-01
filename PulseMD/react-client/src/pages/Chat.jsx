import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../context/AuthContext.jsx';

export default function Chat() {
  const [receiver, setReceiver] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [messages, setMessages] = useState([]);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  async function send() {
    if (!receiver) return toast.error('Enter receiver user id for demo chat.');
    if (file) {
      const form = new FormData();
      form.append('receiver', receiver);
      form.append('text', text);
      form.append('file', file);
      const { data } = await api.post('/chat/upload', form);
      setMessages((old) => [...old, data]);
      setFile(null);
      setText('');
      return;
    }
    const { data } = await api.post('/chat/message', { receiver, text });
    setMessages((old) => [...old, data]);
    setText('');
  }

  async function record() {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    mediaRecorder.current = new MediaRecorder(stream);
    mediaRecorder.current.ondataavailable = (event) => chunks.current.push(event.data);
    mediaRecorder.current.onstop = () => {
      const blob = new Blob(chunks.current, { type: 'audio/webm' });
      setFile(new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' }));
      stream.getTracks().forEach((track) => track.stop());
      toast.success('Voice preview ready. Press Send.');
    };
    mediaRecorder.current.start();
    toast('Recording... press Mic again to stop');
  }

  return (
    <div className="grid gap-4">
      <section className="card">
        <h1 className="text-2xl font-black">Secure chat</h1>
        <input className="input mt-3" placeholder="Receiver user id" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
      </section>
      <section className="card grid min-h-[60dvh] grid-rows-[1fr_auto] gap-3">
        <div className="grid content-start gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {messages.map((message) => <div key={message._id || Math.random()} className="max-w-[85%] rounded-xl bg-white p-3 text-sm shadow-sm">{message.text || message.fileName}<br />{message.fileUrl && <a className="text-clinic-green" href={message.fileUrl}>Open file</a>}</div>)}
        </div>
        {file && <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-sm">Preview: {file.name}</div>}
        <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
          <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="btn-soft" onClick={record}>Mic</button>
          <input className="input" placeholder="Type message" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" onClick={send}>Send</button>
        </div>
      </section>
    </div>
  );
}
