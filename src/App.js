import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Layout, Row, Col, Card, Progress, Tag, Typography, Button, Avatar, ConfigProvider, theme, List, InputNumber, Space, Divider, Input, message, Checkbox, Spin, Tooltip, DatePicker } from 'antd';
import { LogOut, Clock, Calendar as CalendarIcon, Settings, Wallet, FolderGit2, Info, CheckCircle2, ExternalLink, RefreshCw, FileText } from 'lucide-react';
import { GithubOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import ptBR from 'antd/es/locale/pt_BR';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// --- CONFIGURAÇÃO DE AMBIENTE ---
const ORG_NAME = 'GrupoUniasselvi'; 

const REPO_MAP = {
  'evolucao-otimizacao-sistemas': 'Evolução e Otimização de Sistemas',
  'uniasselvi-api-diploma': 'Projeto Diploma',
  'uniasselvi-api-aulas-teams': 'Projeto Aulas Teams',
  'admissao-service': 'Projeto Admissão' 
};

const formatToClock = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
};

const parseGitData = (commits, ignoredUrls = []) => {
  const dailyReport = {};
  const allDeploys = [];
  let totalMinutesMonth = 0;

  commits.forEach(c => {
    const isIgnored = ignoredUrls.includes(c.url);
    const minMatch = c.message.match(/^\[(\d+)\]/);
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    const gmudMatch = c.message.match(/\[GMUD-(\d+)\]/i);
    const gmudId = gmudMatch ? gmudMatch[1] : null;

    let cleanMessage = c.message.replace(/^\[\d+\]\s*-?\s*/, '');
    const friendlyRepo = REPO_MAP[c.repo] || c.repo;
    
    if (!cleanMessage.toLowerCase().includes(friendlyRepo.toLowerCase())) {
        cleanMessage = `${friendlyRepo} – ${cleanMessage}`;
    }

    if (minutes > 0 || gmudId) {
      if (!isIgnored) totalMinutesMonth += minutes;
      if (!dailyReport[c.date]) {
        dailyReport[c.date] = { date: c.date, totalMin: 0, commits: [], gmudCount: 0 };
      }
      if (!isIgnored) dailyReport[c.date].totalMin += minutes;
      if (gmudId) {
          dailyReport[c.date].gmudCount += 1;
          allDeploys.push({ date: c.date, gmud: gmudId, repo: friendlyRepo, url: c.url });
      }
      dailyReport[c.date].commits.push({ 
        repo: friendlyRepo, message: cleanMessage, min: minutes, gmud: gmudId, url: c.url, isIgnored 
      });
    }
  });

  const sortedData = Object.values(dailyReport).sort((a, b) => new Date(b.date) - new Date(a.date));
  const chartData = [...sortedData].reverse().map(d => ({
    date: d.date.split('-').reverse().slice(0,2).join('/'),
    hours: parseFloat((d.totalMin / 60).toFixed(2)),
    clock: formatToClock(d.totalMin)
  }));

  return { dailyReport: sortedData, totalMinutes: totalMinutesMonth, totalHoursDecimal: totalMinutesMonth / 60, chartData, allDeploys };
};

const DashboardContent = ({ user, token, onLogout }) => {
  const [repos, setRepos] = useState([]);
  const [selectedRepos, setSelectedRepos] = useState([]);
  const [commits, setCommits] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [daysToWork, setDaysToWork] = useState(21);
  const [targetHours, setTargetHours] = useState(8);
  const [targetMinutes, setTargetMinutes] = useState(48);
  const [hourlyRate, setHourlyRate] = useState(40);

  const [ignoredCommitUrls, setIgnoredCommitUrls] = useState(() => {
    const saved = localStorage.getItem('ignored_commits');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem('ignored_commits', JSON.stringify(ignoredCommitUrls)); }, [ignoredCommitUrls]);

  const toggleIgnore = (url) => {
    setIgnoredCommitUrls(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
  };

  const filteredCommits = useMemo(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return commits;
    const start = dateRange[0].format('YYYY-MM-DD');
    const end = dateRange[1].format('YYYY-MM-DD');
    return commits.filter(c => c.date >= start && c.date <= end);
  }, [commits, dateRange]);

  const data = useMemo(() => parseGitData(filteredCommits, ignoredCommitUrls), [filteredCommits, ignoredCommitUrls]); 

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(18);
    doc.text(`Relatório de Atividades - ${user.login}`, 14, 20);
    const periodoStr = dateRange ? `${dateRange[0].format('DD/MM/YYYY')} até ${dateRange[1].format('DD/MM/YYYY')}` : 'Todo o período';
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Período: ${periodoStr}`, 14, 28);

    const tableRows = [];
    data.dailyReport.forEach(day => {
      tableRows.push([
        { content: day.date.split('-').reverse().join('/'), styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
        { content: `Total do Dia: ${formatToClock(day.totalMin)}h`, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
      ]);
      day.commits.filter(c => !c.isIgnored).forEach(c => {
        tableRows.push([c.message, `${formatToClock(c.min)}h`]);
      });
    });

    autoTable(doc, {
      startY: 40, head: [['Descrição da Tarefa', 'Tempo']], body: tableRows, theme: 'grid',
      headStyles: { fillColor: [255, 169, 64] }, styles: { fontSize: 9 },
      columnStyles: { 1: { cellWidth: 35, halign: 'right' } }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`TOTAL ACUMULADO: ${formatToClock(data.totalMinutes)}h`, pageWidth - 15, finalY, { align: 'right' });
    doc.save(`relatorio_gitdash_${dayjs().format('MM_YYYY')}.pdf`);
  };

  const syncCommits = useCallback(async () => {
    if (selectedRepos.length === 0 || syncingRef.current) return;
    syncingRef.current = true; setSyncing(true);
    const allFetchedCommits = [];
    try {
      const promises = selectedRepos.map(async (repo) => {
        const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/commits?author=${user.login}&since=2026-01-01&per_page=100`, { headers: { Authorization: `token ${token}` } });
        if (!res.ok) return [];
        const d = await res.json();
        return d.map(c => ({ repo: repo.name, message: c.commit.message, date: new Date(c.commit.author.date).toLocaleDateString('en-CA'), url: c.html_url }));
      });
      const results = await Promise.all(promises);
      results.forEach(list => allFetchedCommits.push(...list));
      setCommits(allFetchedCommits);
      message.success("Dados sincronizados!");
    } catch (err) { message.error("Erro na sincronização."); }
    finally { setSyncing(false); syncingRef.current = false; }
  }, [selectedRepos, user.login, token]);

  const fetchAllRepos = useCallback(async () => {
    setLoadingRepos(true);
    const fetchFromUrl = async (url) => {
      let page = 1; let results = []; let hasMore = true;
      while (hasMore) {
        const res = await fetch(`${url}?per_page=100&page=${page}&sort=updated`, { headers: { Authorization: `token ${token}` } });
        const d = await res.json();
        if (d && d.length > 0) { results = [...results, ...d.map(r => ({ name: r.name, owner: r.owner.login, id: r.id }))]; page++; }
        else { hasMore = false; }
      }
      return results;
    };
    try {
      const [orgResults, userResults] = await Promise.all([fetchFromUrl(`https://api.github.com/orgs/${ORG_NAME}/repos`), fetchFromUrl(`https://api.github.com/user/repos`)]);
      const unique = Array.from(new Map([...orgResults, ...userResults].map(item => [item.id, item])).values());
      setRepos(unique); setSelectedRepos(unique);
    } catch (err) { message.error("Erro ao carregar repositórios."); }
    finally { setLoadingRepos(false); }
  }, [token]);

  useEffect(() => { fetchAllRepos(); }, [fetchAllRepos]);

  const dailyTargetMinutes = useMemo(() => (targetHours * 60) + targetMinutes, [targetHours, targetMinutes]);
  const monthlyTargetMinutes = daysToWork * dailyTargetMinutes;
  const progressPercent = Math.round((data.totalMinutes / monthlyTargetMinutes) * 100);
  const estimatedEarnings = (data.totalHoursDecimal * hourlyRate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const cardStyle = { background: '#161d31', border: '1px solid #283046', borderRadius: '12px' };

  return (
    <Layout style={{ minHeight: '100vh', background: '#0b1120' }}>
      <Header style={{ display: 'flex', alignItems: 'center', background: '#161d31', padding: '0 24px', borderBottom: '1px solid #283046' }}>
        <Space style={{ marginRight: '40px' }}><GithubOutlined style={{ fontSize: 24, color: '#ffa940' }} /><Title level={4} style={{ color: '#fff', margin: 0 }}>GitDash 2026</Title></Space>
        <div style={{ flex: 1 }} />
        <Space size="middle"><Avatar src={user.avatar_url} /><Text style={{ color: '#fff' }}>{user.login}</Text><Button type="text" icon={<LogOut size={18} color="#ef4444" />} onClick={onLogout} /></Space>
      </Header>

      <Content style={{ padding: '32px' }}>
        <Row gutter={[24, 24]}>
          <Col span={24}>
            <Card style={{ ...cardStyle, borderLeft: '4px solid #ffa940' }}>
              <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                <Text strong style={{ color: '#ffa940', fontSize: '16px' }}><Info size={16} style={{marginRight: 8}}/> Guia de Bolso: Comandos de Apontamento</Text>
                <Space wrap>
                  <ConfigProvider locale={ptBR}>
                    <RangePicker value={dateRange} onChange={setDateRange} format="DD/MM/YYYY" style={{ background: '#0b1120', border: '1px solid #283046', color: '#fff' }} />
                  </ConfigProvider>
                  <Button icon={<FileText size={16} />} onClick={generatePDF} disabled={data.dailyReport.length === 0}>Gerar PDF</Button>
                  <Button type="primary" icon={<RefreshCw size={16} />} loading={syncing} onClick={syncCommits}>Sincronizar</Button>
                </Space>
              </Row>

              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6', height: '100%' }}>
                    <Text strong style={{ color: '#60a5fa' }}><FolderGit2 size={14} /> Projetos Uniasselvi / Vitru</Text>
                    <p style={{ color: '#94a3b8', fontSize: '11px', margin: '8px 0' }}>Padrão para entregas de Sprint e Tasks oficiais:</p>
                    <div style={{ background: '#0b1120', padding: '10px', borderRadius: '6px', border: '1px solid #334155' }}>
                      <code style={{ color: '#60a5fa', fontSize: '11px' }}>
                        git commit -m "[{dailyTargetMinutes}] [UNI-1234] Refatoração da API" --date="{dayjs().format('YYYY-MM-DD')}T09:00:00"
                      </code>
                    </div>
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ffa940', height: '100%' }}>
                    <Text strong style={{ color: '#ffa940' }}><Settings size={14} /> Evolução e Otimização de sistemas</Text>
                    <p style={{ color: '#94a3b8', fontSize: '11px', margin: '8px 0' }}>Manutenção e registro de Deploys/GMUDs:</p>
                    <div style={{ background: '#0b1120', padding: '10px', borderRadius: '6px', border: '1px solid #334155', marginBottom: '8px' }}>
                      <code style={{ color: '#52c41a', fontSize: '11px' }}>git commit --allow-empty -m "[{dailyTargetMinutes}] Evolução e Otimização - Suporte" --date="{dayjs().format('YYYY-MM-DD')}T09:00:00"</code>
                    </div>
                    <div style={{ background: '#0b1120', padding: '10px', borderRadius: '6px', border: '1px solid #334155' }}>
                      <code style={{ color: '#ffa940', fontSize: '11px' }}>git commit --allow-empty -m "[{dailyTargetMinutes}] [GMUD-9999] Deploy Produção" --date="{dayjs().format('YYYY-MM-DD')}T09:00:00"</code>
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>

          <Col span={24}>
            <Card style={cardStyle}>
              <Space size="large" wrap>
                <Space><Settings size={18} color="#ffa940" /><Text strong style={{ color: '#fff' }}>Configurações</Text></Space>
                <Divider type="vertical" style={{ background: '#283046', height: 20 }} />
                <Space><Text style={{ color: '#94a3b8' }}>Dias úteis:</Text><InputNumber min={1} value={daysToWork} onChange={setDaysToWork} size="small" /></Space>
                <Space><Text style={{ color: '#94a3b8' }}>Carga:</Text><InputNumber min={0} value={targetHours} onChange={setTargetHours} size="small" />h <InputNumber min={0} max={59} value={targetMinutes} onChange={setTargetMinutes} size="small" />m</Space>
                <Space><Text style={{ color: '#94a3b8' }}>R$/h:</Text><InputNumber min={0} value={hourlyRate} onChange={setHourlyRate} size="small" /></Space>
                <Tag color="orange">Meta: {formatToClock(monthlyTargetMinutes)}h</Tag>
                <Tag color="green">Ganhos: {estimatedEarnings}</Tag>
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={12} lg={6}>
            <Card title={<Text style={{color: '#fff'}}><Clock size={16} /> Progresso</Text>} style={cardStyle}>
              <div style={{ textAlign: 'center' }}><Progress type="dashboard" percent={progressPercent} strokeColor="#ffa940" width={140} format={() => <div style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold' }}>{formatToClock(data.totalMinutes)}h</div>}/></div>
            </Card>
          </Col>

          <Col xs={24} md={12} lg={6}>
            <Card title={<Text style={{color: '#fff'}}><Wallet size={16} /> Financeiro</Text>} style={cardStyle}>
              <div style={{ height: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#94a3b8', fontSize: '11px' }}>PREVISÃO BRUTA</Text>
                <Title level={2} style={{ color: '#52c41a', margin: '4px 0' }}>{estimatedEarnings}</Title>
                <Tag color="blue">{data.dailyReport.length} dias ativos</Tag>
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card title={<Text style={{color: '#fff'}}><CalendarIcon size={16} /> Histórico</Text>} style={cardStyle}>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.chartData}>
                    <XAxis dataKey="date" tick={{fill: '#94a3b8', fontSize: 10}} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#161d31', border: '1px solid #283046' }} />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {data.chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={(entry.hours * 60) >= dailyTargetMinutes ? '#ffa940' : '#3b82f6'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
        </Row>

        {data.dailyReport.length > 0 && (
          <List style={{ marginTop: 24 }} dataSource={data.dailyReport} renderItem={day => (
            <Card style={{ ...cardStyle, marginBottom: 10 }} bodyStyle={{ padding: '15px' }}>
              <Row align="middle">
                <Col span={4}><Text strong style={{ color: '#fff' }}>{day.date.split('-').reverse().slice(0,2).join('/')}</Text></Col>
                <Col span={4}><Tag color="orange">{formatToClock(day.totalMin)}h</Tag></Col>
                <Col span={16}>
                  {day.commits.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, opacity: c.isIgnored ? 0.4 : 1 }}>
                      <Checkbox checked={!c.isIgnored} onChange={() => toggleIgnore(c.url)} style={{ marginRight: 8 }} />
                      <CheckCircle2 size={14} color="#52c41a" style={{ marginRight: 8 }} />
                      <Text style={{ color: '#cbd5e1', fontSize: '13px', flex: 1 }}>{c.message}</Text>
                      <a href={c.url} target="_blank" rel="noreferrer"><ExternalLink size={14} color="#94a3b8" /></a>
                    </div>
                  ))}
                </Col>
              </Row>
            </Card>
          )} />
        )}
      </Content>
    </Layout>
  );
};

const App = () => {
  const [token, setToken] = useState(localStorage.getItem('gh_token') || '');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleConnect = async (tk) => {
    if (!tk) return; setLoading(true);
    try {
      const res = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${tk}` } });
      if (res.ok) { const d = await res.json(); setUser(d); setToken(tk); localStorage.setItem('gh_token', tk); }
    } catch (err) { message.error("Erro ao conectar."); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (token && !user) handleConnect(token); }, []);

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#ffa940', borderRadius: 12 } }}>
      {!user ? (
        <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0b1120' }}>
          <Card style={{ width: 400, textAlign: 'center', background: '#161d31' }}>
            <GithubOutlined style={{ fontSize: 48, color: '#ffa940', marginBottom: 20 }} />
            <Input.Password placeholder="Token" value={token} onChange={e => setToken(e.target.value)} style={{ marginBottom: 16 }} />
            <Button type="primary" block loading={loading} onClick={() => handleConnect(token)}>Acessar</Button>
          </Card>
        </div>
      ) : <DashboardContent user={user} token={token} onLogout={() => { setUser(null); setToken(''); localStorage.removeItem('gh_token'); }} />}
    </ConfigProvider>
  );
};

export default App;