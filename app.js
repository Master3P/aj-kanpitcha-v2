// =====================================================
// AJ.Kanpitcha v2 - GitHub Pages + Supabase
// Phase 2: Student Login + Check-in
// =====================================================

let sb = null;
let COURSES = [];
let SETTINGS = {};
let STUDENT = null;

function initApp(){
  document.getElementById('dateBox').innerText = new Date().toLocaleDateString('th-TH', {
    weekday:'long',
    year:'numeric',
    month:'long',
    day:'numeric'
  });

  if(!SUPABASE_URL || SUPABASE_URL.includes('xxxxxxxxxxxx')){
    toast('กรุณาใส่ Project URL จริงใน config.js');
    return;
  }

  sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  loadInitialData();
}

async function loadInitialData(){
  showLoading('กำลังโหลดระบบ', 'ระบบกำลังเชื่อมต่อ Supabase...');

  try {
    await Promise.all([
      loadSettings(),
      loadCourses()
    ]);

    renderCourses();
    renderAgreement();

    hideLoading();

  } catch(err) {
    hideLoading();
    alert('โหลดระบบไม่สำเร็จ: ' + err.message);
  }
}

async function loadSettings(){
  const { data, error } = await sb
    .from('system_settings')
    .select('key,value');

  if(error) throw error;

  SETTINGS = {};
  (data || []).forEach(r => {
    SETTINGS[r.key] = r.value || '';
  });
}

async function loadCourses(){
  const { data, error } = await sb
    .from('courses')
    .select('id, course_name, display_name')
    .eq('status', 'ใช้งาน')
    .order('created_at', { ascending:true });

  if(error) throw error;

  COURSES = data || [];
}

async function loadCoursesSilent(){
  showSmallLoading('loginCourse', 'กำลังโหลดรายวิชา...');
  await loadCourses();
  renderCourses();
  toast('รีเฟรชรายวิชาสำเร็จ');
}

function renderCourses(){
  const select = document.getElementById('loginCourse');

  select.innerHTML = COURSES.length
    ? COURSES.map(c => `<option value="${esc(c.id)}">${esc(c.display_name || c.course_name)}</option>`).join('')
    : '<option value="">ยังไม่มีรายวิชา</option>';
}

function renderAgreement(){
  const agreementText = document.getElementById('agreementText');
  const agreementImageBox = document.getElementById('agreementImageBox');

  if(agreementText){
    agreementText.innerText = SETTINGS.agreement_text || '';
  }

  if(agreementImageBox){
    const img = SETTINGS.agreement_image_url || '';

    agreementImageBox.innerHTML = img
      ? `<img class="rules-img" src="${esc(img)}">`
      : '<div class="note">ยังไม่มีภาพกติกา</div>';
  }
}

async function studentLogin(){
  const courseId = val('loginCourse');
  const studentId = val('loginStudentId');
  const fullName = val('loginFullName');

  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!studentId) return toast('กรุณากรอกรหัสนักศึกษา');
  if(!fullName) return toast('กรุณากรอกชื่อ - นามสกุล');

  showLoading('กำลังเข้าสู่ระบบ', 'ระบบกำลังตรวจสอบข้อมูลนักศึกษา...');

  try {
    const { data, error } = await sb.rpc('student_login_v2', {
      p_course_id: courseId,
      p_student_id: studentId,
      p_full_name: fullName
    });

    if(error) throw error;

    if(!data.ok){
      hideLoading();
      toast(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
      return;
    }

    STUDENT = data.data;

    document.getElementById('studentInfo').innerText =
      `${STUDENT.course_name} | ${STUDENT.student_id} ${STUDENT.full_name}`;

    await loadAttendanceToday();

    hideLoading();
    showPage('pageRules');

  } catch(err) {
    hideLoading();
    alert('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
  }
}

function acceptRules(){
  showPage('pageDashboard');
}

async function refreshStudentData(){
  if(!STUDENT) return;
  await loadAttendanceToday();
  toast('รีเฟรชข้อมูลสำเร็จ');
}

async function openCheckInPage(){
  showPage('pageCheckIn');
  await loadAttendanceToday();
}

async function loadAttendanceToday(){
  if(!STUDENT) return;

  try {
    const { data, error } = await sb.rpc('get_student_attendance_today_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    if(data && data.ok){
      renderAttendanceSummary(data.data);
    }

  } catch(err) {
    console.error(err);
    toast('โหลดสรุปเช็คชื่อไม่สำเร็จ');
  }
}

function renderAttendanceSummary(d){
  const stats = document.getElementById('attendanceStats');
  const tableBox = document.getElementById('attendanceTable');

  if(stats){
    stats.innerHTML = `
      <div class="stat-card">
        <div class="stat-num">${esc(d.total_today || 0)}</div>
        <b>รอบวันนี้</b>
      </div>
      <div class="stat-card">
        <div class="stat-num">${esc(d.checked_today || 0)}</div>
        <b>เช็คแล้ว</b>
      </div>
      <div class="stat-card">
        <div class="stat-num">${esc(d.missing_today || 0)}</div>
        <b>ยังไม่เช็ค</b>
      </div>
    `;
  }

  const rows = d.rows || [];

  if(tableBox){
    tableBox.innerHTML = rows.length
      ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ครั้งที่</th>
                <th>ชื่อรอบ</th>
                <th>เวลาเปิด</th>
                <th>หมดเวลา</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.session_no || '-')}</td>
                  <td>${esc(r.session_label || '-')}</td>
                  <td>${formatDateTime(r.opened_at)}</td>
                  <td>${formatDateTime(r.close_at)}</td>
                  <td>${r.status === 'เช็คแล้ว' ? '<span class="check">✓ เช็คแล้ว</span>' : '<span class="miss">ยังไม่เช็ค</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="note">วันนี้ยังไม่มีรอบเช็คชื่อ</div>';
  }
}

async function studentCheckIn(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  const pin = val('checkPin');
  if(!pin) return toast('กรุณากรอกรหัสเข้าเรียน');

  showLoading('กำลังเช็คชื่อ', 'ระบบกำลังบันทึกการเข้าเรียน...');

  try {
    const { data, error } = await sb.rpc('student_check_in_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id,
      p_full_name: STUDENT.full_name,
      p_pin: pin
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'เช็คชื่อไม่สำเร็จ');
      return;
    }

    document.getElementById('checkPin').value = '';

    toast(data.message || 'เช็คชื่อสำเร็จ');
    await loadAttendanceToday();

  } catch(err) {
    hideLoading();
    alert('เช็คชื่อไม่สำเร็จ: ' + err.message);
  }
}

function openGuidePage(){
  const box = document.getElementById('guideBox');

  box.innerText = SETTINGS.student_guide_text || 'ยังไม่มีคู่มือการใช้งาน';

  showPage('pageGuide');
}

function showPage(id){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

function showLoading(title, text){
  document.getElementById('loadingTitle').innerText = title || 'กำลังดำเนินการ';
  document.getElementById('loadingText').innerText = text || 'กรุณารอสักครู่...';
  document.getElementById('loading').classList.remove('hidden');

  document.querySelectorAll('button').forEach(btn => btn.disabled = true);
}

function hideLoading(){
  document.getElementById('loading').classList.add('hidden');

  document.querySelectorAll('button').forEach(btn => btn.disabled = false);
}

function showSmallLoading(selectId, text){
  const el = document.getElementById(selectId);
  if(el){
    el.innerHTML = `<option>${esc(text)}</option>`;
  }
}

function toast(msg){
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.classList.add('show');

  setTimeout(() => t.classList.remove('show'), 1800);
}

function val(id){
  return (document.getElementById(id)?.value || '').trim();
}

function esc(t){
  return String(t ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function formatDateTime(v){
  if(!v) return '-';

  try {
    return new Date(v).toLocaleString('th-TH', {
      timeZone:'Asia/Bangkok',
      day:'2-digit',
      month:'2-digit',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit'
    });
  } catch(err) {
    return '-';
  }
}
