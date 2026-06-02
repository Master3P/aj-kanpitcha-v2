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
// =====================================================
// TEACHER PANEL - Phase 3
// =====================================================

let TEACHER = null;

function showTeacherLogin(){
  showPage('pageTeacherLogin');
}

async function teacherLogin(){
  const username = val('teacherUser');
  const password = val('teacherPass');

  if(!username) return toast('กรุณากรอกชื่อผู้ใช้');
  if(!password) return toast('กรุณากรอกรหัสผ่าน');

  showLoading('กำลังเข้าสู่ระบบอาจารย์', 'ระบบกำลังตรวจสอบสิทธิ์...');

  try {
    const { data, error } = await sb.rpc('teacher_login_v2', {
      p_username: username,
      p_password: password
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
      return;
    }

    TEACHER = data.data;
    localStorage.setItem('teacher_token', TEACHER.token);
    localStorage.setItem('teacher_name', TEACHER.teacher_name || 'Admin');

    document.getElementById('teacherInfo').innerText =
      'เข้าสู่ระบบแล้ว: ' + (TEACHER.teacher_name || TEACHER.username);

    await refreshTeacherCourses();

    showPage('pageTeacherPanel');

  } catch(err) {
    hideLoading();
    alert('เข้าสู่ระบบอาจารย์ไม่สำเร็จ: ' + err.message);
  }
}

function teacherLogout(){
  TEACHER = null;
  localStorage.removeItem('teacher_token');
  localStorage.removeItem('teacher_name');
  showPage('pageLogin');
  toast('ออกจากระบบแล้ว');
}

function getTeacherToken(){
  return TEACHER?.token || localStorage.getItem('teacher_token') || '';
}

function teacherTab(id){
  document.querySelectorAll('.teacher-box').forEach(x => x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function refreshTeacherCourses(){
  await loadCourses();

  const html = COURSES.length
    ? COURSES.map(c => `<option value="${esc(c.id)}">${esc(c.display_name || c.course_name)}</option>`).join('')
    : '<option value="">ยังไม่มีรายวิชา</option>';

  ['teacherStudentCourse','teacherAttendanceCourse'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = html;
  });

  renderCourses();
}

async function teacherCreateCourse(){
  const token = getTeacherToken();

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  showLoading('กำลังเพิ่มรายวิชา', 'ระบบกำลังบันทึกข้อมูลรายวิชา...');

  try {
    const { data, error } = await sb.rpc('teacher_create_course_v2', {
      p_token: token,
      p_course_name: val('courseName'),
      p_display_name: val('courseDisplayName'),
      p_google_sheet_id: val('courseSheetId'),
      p_sheet_name: val('courseSheetName')
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'เพิ่มรายวิชาไม่สำเร็จ');
      return;
    }

    toast(data.message || 'เพิ่มรายวิชาสำเร็จ');

    document.getElementById('courseName').value = '';
    document.getElementById('courseDisplayName').value = '';
    document.getElementById('courseSheetId').value = '';
    document.getElementById('courseSheetName').value = '';

    await refreshTeacherCourses();

  } catch(err) {
    hideLoading();
    alert('เพิ่มรายวิชาไม่สำเร็จ: ' + err.message);
  }
}

async function teacherAddStudent(){
  const token = getTeacherToken();

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  const courseId = val('teacherStudentCourse');

  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  showLoading('กำลังบันทึกนักศึกษา', 'ระบบกำลังเพิ่มข้อมูลนักศึกษา...');

  try {
    const { data, error } = await sb.rpc('teacher_add_student_v2', {
      p_token: token,
      p_course_id: courseId,
      p_student_id: val('newStudentId'),
      p_full_name: val('newStudentName'),
      p_row_number: Number(val('newStudentRow') || 0)
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'บันทึกนักศึกษาไม่สำเร็จ');
      return;
    }

    toast(data.message || 'บันทึกนักศึกษาสำเร็จ');

    document.getElementById('newStudentId').value = '';
    document.getElementById('newStudentName').value = '';
    document.getElementById('newStudentRow').value = '';

    await teacherLoadStudents();

  } catch(err) {
    hideLoading();
    alert('บันทึกนักศึกษาไม่สำเร็จ: ' + err.message);
  }
}

async function teacherLoadStudents(){
  const token = getTeacherToken();
  const courseId = val('teacherStudentCourse');
  const box = document.getElementById('teacherStudentList');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  box.innerHTML = 'กำลังโหลดรายชื่อ...';

  try {
    const { data, error } = await sb.rpc('teacher_get_students_v2', {
      p_token: token,
      p_course_id: courseId
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? rows.map(s => `
          <div class="student-row">
            <div>
              <b>${esc(s.student_id)}</b><br>
              ${esc(s.full_name)}
            </div>
            <small>แถว ${esc(s.row_number || '-')}</small>
          </div>
        `).join('')
      : '<div class="note">ยังไม่มีรายชื่อนักศึกษา</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดรายชื่อไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function teacherOpenAttendance(){
  const token = getTeacherToken();
  const courseId = val('teacherAttendanceCourse');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  showLoading('กำลังเปิดเช็คชื่อ', 'ระบบกำลังสร้างรอบเช็คชื่อใหม่...');

  try {
    const { data, error } = await sb.rpc('teacher_open_attendance_v2', {
      p_token: token,
      p_course_id: courseId,
      p_session_label: val('attLabel'),
      p_pin: val('attPin'),
      p_duration_minutes: Number(val('attDuration') || 10)
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'เปิดเช็คชื่อไม่สำเร็จ');
      return;
    }

    toast(data.message || 'เปิดเช็คชื่อสำเร็จ');
    await teacherLoadAttendanceStatus();

  } catch(err) {
    hideLoading();
    alert('เปิดเช็คชื่อไม่สำเร็จ: ' + err.message);
  }
}

async function teacherCloseAttendance(){
  const token = getTeacherToken();
  const courseId = val('teacherAttendanceCourse');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  showLoading('กำลังปิดเช็คชื่อ', 'ระบบกำลังปิดรอบเช็คชื่อ...');

  try {
    const { data, error } = await sb.rpc('teacher_close_attendance_v2', {
      p_token: token,
      p_course_id: courseId
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'ปิดเช็คชื่อไม่สำเร็จ');
      return;
    }

    toast(data.message || 'ปิดเช็คชื่อสำเร็จ');
    await teacherLoadAttendanceStatus();

  } catch(err) {
    hideLoading();
    alert('ปิดเช็คชื่อไม่สำเร็จ: ' + err.message);
  }
}

async function teacherLoadAttendanceStatus(){
  const token = getTeacherToken();
  const courseId = val('teacherAttendanceCourse');
  const box = document.getElementById('teacherAttendanceStatus');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  box.innerHTML = 'กำลังโหลดสถานะ...';

  try {
    const { data, error } = await sb.rpc('teacher_get_attendance_status_v2', {
      p_token: token,
      p_course_id: courseId
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    if(!data.data){
      box.innerHTML = '<div class="note">ยังไม่มีรอบเช็คชื่อ</div>';
      return;
    }

    const s = data.data;

    box.innerHTML = `
      <div class="status-box">
        <h3>ครั้งที่ ${esc(s.session_no)} : ${esc(s.session_label || '-')}</h3>
        <p>สถานะ:
          <span class="${s.status === 'เปิด' ? 'status-open' : 'status-close'}">
            ${esc(s.status)}
          </span>
        </p>
        <p>เปิดเมื่อ: ${formatDateTime(s.opened_at)}</p>
        <p>หมดเวลา: ${formatDateTime(s.close_at)}</p>
        <p>จำนวนผู้เช็คชื่อ: <b>${esc(s.checked_count)}</b> คน</p>
      </div>
    `;

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดสถานะไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}
