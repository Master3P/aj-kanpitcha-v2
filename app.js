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
    teacherTab('teacherDashboardBox');
    await teacherPrepareDashboard();

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

  ['teacherDashboardCourse','teacherStudentCourse','teacherAttendanceCourse','teacherAssignmentCourse','teacherLeaveCourse','teacherScoreCourse','teacherMaterialCourse','teacherExportCourse'].forEach(id => {
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
// =====================================================
// PHASE 4 - Assignments + Submissions
// =====================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png'
];

let STUDENT_ASSIGNMENTS = [];

async function openSubmissionPage(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  showPage('pageSubmission');
  await loadStudentAssignments();
}

async function loadStudentAssignments(){
  const select = document.getElementById('submissionAssignment');
  const detail = document.getElementById('assignmentDetailBox');

  select.innerHTML = '<option value="">กำลังโหลดชิ้นงาน...</option>';
  detail.innerHTML = '';

  try {
    const { data, error } = await sb.rpc('student_get_assignments_v2', {
      p_course_id: STUDENT.course_id
    });

    if(error) throw error;

    if(!data.ok){
      select.innerHTML = '<option value="">โหลดชิ้นงานไม่สำเร็จ</option>';
      toast(data.message || 'โหลดชิ้นงานไม่สำเร็จ');
      return;
    }

    STUDENT_ASSIGNMENTS = data.data || [];

    select.innerHTML = STUDENT_ASSIGNMENTS.length
      ? STUDENT_ASSIGNMENTS.map(a => `
          <option value="${esc(a.item_column)}">
            ${esc(a.title)}
          </option>
        `).join('')
      : '<option value="">ยังไม่มีชิ้นงานที่เปิดให้ส่ง</option>';

    renderAssignmentDetail();

  } catch(err) {
    select.innerHTML = '<option value="">โหลดชิ้นงานไม่สำเร็จ</option>';
    alert('โหลดชิ้นงานไม่สำเร็จ: ' + err.message);
  }
}

function renderAssignmentDetail(){
  const col = val('submissionAssignment');
  const box = document.getElementById('assignmentDetailBox');

  const a = STUDENT_ASSIGNMENTS.find(x => x.item_column === col);

  if(!a){
    box.innerHTML = 'ยังไม่ได้เลือกชิ้นงาน';
    return;
  }

  box.innerHTML = `
    <b>${esc(a.title)}</b><br>
    คะแนนเต็ม: ${esc(a.max_score || '-')}<br>
    กำหนดส่ง: ${a.due_date ? esc(a.due_date) : '-'}<br><br>
    <div style="white-space:pre-wrap">${esc(a.description || '-')}</div>
  `;
}

async function studentSubmitAssignment(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  const itemColumn = val('submissionAssignment');
  const fileInput = document.getElementById('submissionFile');
  const file = fileInput.files[0];

  if(!itemColumn) return toast('กรุณาเลือกชิ้นงาน');
  if(!file) return toast('กรุณาแนบไฟล์งาน');

  if(file.size > MAX_FILE_SIZE){
    toast('ไฟล์ใหญ่เกิน 10 MB');
    return;
  }

  if(!ALLOWED_UPLOAD_TYPES.includes(file.type)){
    toast('ไม่รองรับชนิดไฟล์นี้');
    return;
  }

  showLoading('กำลังส่งงาน', 'ระบบกำลังอัปโหลดไฟล์และบันทึกการส่งงาน...');

  try {
    const safeName = makeSafeFileName(file.name);
    const path = `${STUDENT.course_id}/${itemColumn}/${STUDENT.student_id}_${Date.now()}_${safeName}`;

    const upload = await sb.storage
      .from('submissions')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if(upload.error) throw upload.error;

    const publicUrl = sb.storage
      .from('submissions')
      .getPublicUrl(path)
      .data
      .publicUrl;

    const { data, error } = await sb.rpc('student_submit_assignment_v2', {
      p_course_id: STUDENT.course_id,
      p_item_column: itemColumn,
      p_student_id: STUDENT.student_id,
      p_full_name: STUDENT.full_name,
      p_file_url: publicUrl,
      p_file_name: file.name
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'ส่งงานไม่สำเร็จ');
      return;
    }

    fileInput.value = '';
    toast('ส่งงานสำเร็จ');

  } catch(err) {
    hideLoading();
    alert('ส่งงานไม่สำเร็จ: ' + err.message);
  }
}

async function openSubmissionStatusPage(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  showPage('pageSubmissionStatus');
  await loadStudentSubmissionStatus();
}

async function loadStudentSubmissionStatus(){
  const box = document.getElementById('submissionStatusBox');

  box.innerHTML = 'กำลังโหลดสถานะ...';

  try {
    const { data, error } = await sb.rpc('student_get_submission_status_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชิ้นงาน</th>
                <th>สถานะ</th>
                <th>เวลาส่งล่าสุด</th>
                <th>ไฟล์</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.title)}</td>
                  <td>${r.status === 'ส่งแล้ว' ? '<span class="check">✓ ส่งแล้ว</span>' : '<span class="miss">ยังไม่ส่ง</span>'}</td>
                  <td>${formatDateTime(r.submitted_at)}</td>
                  <td>${r.file_url ? `<a class="file-link" target="_blank" href="${esc(r.file_url)}">เปิดไฟล์</a>` : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="note">ยังไม่มีชิ้นงานที่เปิดให้ส่ง</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดสถานะไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function teacherCreateAssignment(){
  const token = getTeacherToken();

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  const courseId = val('teacherAssignmentCourse');

  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  showLoading('กำลังบันทึกชิ้นงาน', 'ระบบกำลังบันทึกรายละเอียดชิ้นงาน...');

  try {
    const dueDate = val('assignmentDueDate') || null;

    const { data, error } = await sb.rpc('teacher_create_assignment_v2', {
      p_token: token,
      p_course_id: courseId,
      p_item_column: val('assignmentColumn'),
      p_title: val('assignmentTitle'),
      p_description: val('assignmentDescription'),
      p_max_score: Number(val('assignmentMaxScore') || 0),
      p_due_date: dueDate
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'บันทึกชิ้นงานไม่สำเร็จ');
      return;
    }

    toast('บันทึกชิ้นงานสำเร็จ');

    document.getElementById('assignmentColumn').value = '';
    document.getElementById('assignmentTitle').value = '';
    document.getElementById('assignmentDescription').value = '';
    document.getElementById('assignmentMaxScore').value = '';
    document.getElementById('assignmentDueDate').value = '';

  } catch(err) {
    hideLoading();
    alert('บันทึกชิ้นงานไม่สำเร็จ: ' + err.message);
  }
}

async function teacherLoadSubmissionReport(){
  const token = getTeacherToken();

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  const courseId = val('teacherAssignmentCourse');
  const itemColumn = val('submissionReportColumn');
  const box = document.getElementById('teacherSubmissionReportBox');

  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!itemColumn) return toast('กรุณากรอกคอลัมน์ชิ้นงาน');

  box.innerHTML = 'กำลังโหลดรายงาน...';

  try {
    const { data, error } = await sb.rpc('teacher_get_submission_report_v2', {
      p_token: token,
      p_course_id: courseId,
      p_item_column: itemColumn
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ</th>
                <th>สถานะ</th>
                <th>เวลาส่งล่าสุด</th>
                <th>ไฟล์</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.student_id)}</td>
                  <td>${esc(r.full_name)}</td>
                  <td>${r.status === 'ส่งแล้ว' ? '<span class="check">✓ ส่งแล้ว</span>' : '<span class="miss">ยังไม่ส่ง</span>'}</td>
                  <td>${formatDateTime(r.submitted_at)}</td>
                  <td>${r.file_url ? `<a class="file-link" target="_blank" href="${esc(r.file_url)}">เปิดไฟล์</a>` : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="note">ยังไม่มีข้อมูลนักศึกษา</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดรายงานไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

function makeSafeFileName(name){
  const original = String(name || 'file');
  const parts = original.split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : 'bin';

  const safeExt = ext
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10) || 'bin';

  return 'file.' + safeExt;
}

// =====================================================
// PHASE 5 - Special Scores + Leave Requests
// =====================================================

const ALLOWED_LEAVE_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png'
];

async function openSpecialScorePage(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');
  showPage('pageSpecialScore');
  await loadStudentSpecialScores();
}

async function studentSubmitSpecialScore(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  const score = Number(val('specialScoreValue') || 0);
  const detail = val('specialScoreDetail');

  if(score < 1 || score > 3){
    return toast('กรุณาเลือกคะแนน +1 ถึง +3');
  }

  showLoading('กำลังบันทึกคะแนนพิเศษ', 'ระบบกำลังบันทึกคะแนนพิเศษ...');

  try {
    const { data, error } = await sb.rpc('student_add_special_score_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id,
      p_full_name: STUDENT.full_name,
      p_score: score,
      p_detail: detail
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'บันทึกคะแนนพิเศษไม่สำเร็จ');
      return;
    }

    document.getElementById('specialScoreDetail').value = '';
    toast('บันทึกคะแนนพิเศษสำเร็จ');
    await loadStudentSpecialScores();

  } catch(err) {
    hideLoading();
    alert('บันทึกคะแนนพิเศษไม่สำเร็จ: ' + err.message);
  }
}

async function loadStudentSpecialScores(){
  if(!STUDENT) return;

  const box = document.getElementById('specialScoreHistoryBox');
  box.innerHTML = 'กำลังโหลดประวัติ...';

  try {
    const { data, error } = await sb.rpc('student_get_special_scores_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const d = data.data || {};
    const rows = d.rows || [];

    box.innerHTML = `
      <div class="stat-card">
        <div class="stat-num">${esc(d.total || 0)}</div>
        <b>คะแนนพิเศษรวม</b>
      </div>
      ${
        rows.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>คะแนน</th>
                    <th>รายละเอียด</th>
                    <th>รวมหลังบวก</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(r => `
                    <tr>
                      <td>${formatDateTime(r.created_at)}</td>
                      <td>+${esc(r.score)}</td>
                      <td>${esc(r.detail || '-')}</td>
                      <td>${esc(r.new_total || '-')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
          : '<div class="note">ยังไม่มีประวัติคะแนนพิเศษ</div>'
      }
    `;

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดประวัติไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function openLeavePage(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');
  showPage('pageLeave');
  await loadStudentLeaveHistory();
}

async function studentSubmitLeave(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  const leaveDate = val('leaveDate');
  const leaveType = val('leaveType');
  const reason = val('leaveReason');
  const fileInput = document.getElementById('leaveFile');
  const file = fileInput.files[0];

  if(!leaveDate) return toast('กรุณาเลือกวันที่ลา');
  if(!leaveType) return toast('กรุณาเลือกประเภทการลา');

  let fileUrl = '';
  let fileName = '';

  showLoading('กำลังส่งใบลา', 'ระบบกำลังบันทึกใบลาเรียน...');

  try {
    if(file){
      if(file.size > MAX_FILE_SIZE){
        hideLoading();
        return toast('ไฟล์ใหญ่เกิน 10 MB');
      }

      if(!ALLOWED_LEAVE_FILE_TYPES.includes(file.type)){
        hideLoading();
        return toast('รองรับเฉพาะ PDF, JPG, PNG');
      }

      const safeName = makeSafeFileName(file.name);
      const path = `${STUDENT.course_id}/leave_${STUDENT.student_id}_${Date.now()}_${safeName}`;

      const upload = await sb.storage
        .from('leave-files')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if(upload.error) throw upload.error;

      fileUrl = sb.storage
        .from('leave-files')
        .getPublicUrl(path)
        .data
        .publicUrl;

      fileName = file.name;
    }

    const { data, error } = await sb.rpc('student_submit_leave_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id,
      p_full_name: STUDENT.full_name,
      p_leave_date: leaveDate,
      p_leave_type: leaveType,
      p_reason: reason,
      p_file_url: fileUrl,
      p_file_name: fileName
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'ส่งใบลาไม่สำเร็จ');
      return;
    }

    document.getElementById('leaveReason').value = '';
    document.getElementById('leaveFile').value = '';

    toast('ส่งใบลาเรียบร้อยแล้ว');
    await loadStudentLeaveHistory();

  } catch(err) {
    hideLoading();
    alert('ส่งใบลาไม่สำเร็จ: ' + err.message);
  }
}

async function loadStudentLeaveHistory(){
  if(!STUDENT) return;

  const box = document.getElementById('leaveHistoryBox');
  box.innerHTML = 'กำลังโหลดประวัติการลา...';

  try {
    const { data, error } = await sb.rpc('student_get_leave_history_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่ส่ง</th>
                <th>วันที่ลา</th>
                <th>ประเภท</th>
                <th>เหตุผล</th>
                <th>หลักฐาน</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${formatDateTime(r.created_at)}</td>
                  <td>${esc(r.leave_date || '-')}</td>
                  <td>${esc(r.leave_type || '-')}</td>
                  <td>${esc(r.reason || '-')}</td>
                  <td>${r.file_url ? `<a class="file-link" target="_blank" href="${esc(r.file_url)}">เปิดหลักฐาน</a>` : '-'}</td>
                  <td>${esc(r.status || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="note">ยังไม่มีประวัติการลา</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดประวัติไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function teacherLoadLeaveRequests(){
  const token = getTeacherToken();
  const courseId = val('teacherLeaveCourse');
  const box = document.getElementById('teacherLeaveBoxList');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  box.innerHTML = 'กำลังโหลดรายการลา...';

  try {
    const { data, error } = await sb.rpc('teacher_get_leave_requests_v2', {
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
      ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วันที่ส่ง</th>
                <th>รหัส</th>
                <th>ชื่อ</th>
                <th>วันที่ลา</th>
                <th>ประเภท</th>
                <th>เหตุผล</th>
                <th>หลักฐาน</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${formatDateTime(r.created_at)}</td>
                  <td>${esc(r.student_id)}</td>
                  <td>${esc(r.full_name)}</td>
                  <td>${esc(r.leave_date || '-')}</td>
                  <td>${esc(r.leave_type || '-')}</td>
                  <td>${esc(r.reason || '-')}</td>
                  <td>${r.file_url ? `<a class="file-link" target="_blank" href="${esc(r.file_url)}">เปิดหลักฐาน</a>` : '-'}</td>
                  <td>${esc(r.status || '-')}</td>
                  <td>
                    <button class="btn-soft small" onclick="teacherUpdateLeaveStatus('${esc(r.id)}','รับทราบ')">รับทราบ</button>
                    <button class="btn-soft small" onclick="teacherUpdateLeaveStatus('${esc(r.id)}','ไม่อนุมัติ')">ไม่อนุมัติ</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="note">ยังไม่มีรายการลาเรียน</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดรายการลาไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function teacherUpdateLeaveStatus(leaveId, status){
  const token = getTeacherToken();

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  showLoading('กำลังอัปเดตสถานะ', 'ระบบกำลังบันทึกสถานะใบลา...');

  try {
    const { data, error } = await sb.rpc('teacher_update_leave_status_v2', {
      p_token: token,
      p_leave_id: leaveId,
      p_status: status
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'อัปเดตสถานะไม่สำเร็จ');
      return;
    }

    toast('อัปเดตสถานะเรียบร้อยแล้ว');
    await teacherLoadLeaveRequests();

  } catch(err) {
    hideLoading();
    alert('อัปเดตสถานะไม่สำเร็จ: ' + err.message);
  }
}

// =====================================================
// PHASE 6 - Sync Courses/Students from Google Sheet
// =====================================================

async function syncCoursesFromGoogleSheet(){
  const token = getTeacherToken();

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  if(!BRIDGE_URL || BRIDGE_URL.includes('ใส่')){
    return toast('ยังไม่ได้ตั้งค่า BRIDGE_URL ใน config.js');
  }

  showLoading('กำลังซิงค์จาก Google Sheet', 'ระบบกำลังดึงรายวิชาและรายชื่อนักศึกษา...');

  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'syncCoursesFromSheet'
      })
    });

    const data = await res.json();

    hideLoading();

    if(!data.ok){
      alert(data.message || 'ซิงค์ไม่สำเร็จ');
      return;
    }

    const d = data.data || {};

    toast('ซิงค์สำเร็จ');

    alert(
      'ซิงค์สำเร็จ\n' +
      'ไฟล์: ' + (d.spreadsheetName || '-') + '\n' +
      'นำเข้ารายวิชา: ' + (d.importedCourses || 0) + '\n' +
      'ข้ามชีต: ' + (d.skippedSheets || 0) + '\n' +
      'นำเข้านักศึกษา: ' + (d.importedStudents || 0) + '\n' +
      'นำเข้าชิ้นงาน: ' + (d.importedAssignments || 0)
    );

    await refreshTeacherCourses();

  } catch(err) {
    hideLoading();
    alert('ซิงค์ไม่สำเร็จ: ' + err.message);
  }
}

// =====================================================
// PHASE 7 - Manual Score Entry + Sync to Google Sheet
// =====================================================

let SCORE_ASSIGNMENTS = [];

async function teacherPrepareScorePage(){
  await refreshTeacherCourses();
  await teacherLoadScoreAssignments();
}

async function teacherLoadScoreAssignments(){
  const token = getTeacherToken();
  const courseId = val('teacherScoreCourse');
  const select = document.getElementById('teacherScoreAssignment');

  if(!token || !courseId || !select) return;

  select.innerHTML = '<option value="">กำลังโหลดชิ้นงาน...</option>';

  try {
    const { data, error } = await sb.rpc('teacher_get_assignments_v2', {
      p_token: token,
      p_course_id: courseId
    });

    if(error) throw error;

    if(!data.ok){
      select.innerHTML = '<option value="">โหลดชิ้นงานไม่สำเร็จ</option>';
      toast(data.message || 'โหลดชิ้นงานไม่สำเร็จ');
      return;
    }

    SCORE_ASSIGNMENTS = data.data || [];

    select.innerHTML = SCORE_ASSIGNMENTS.length
      ? SCORE_ASSIGNMENTS.map(a => `
          <option value="${esc(a.item_column)}">
            ${esc(a.title)}
          </option>
        `).join('')
      : '<option value="">ยังไม่มีชิ้นงาน</option>';

  } catch(err) {
    select.innerHTML = '<option value="">โหลดชิ้นงานไม่สำเร็จ</option>';
    toast('โหลดชิ้นงานไม่สำเร็จ');
  }
}

let scoreSearchTimer = null;

function teacherSearchStudentsForScore(){
  clearTimeout(scoreSearchTimer);
  scoreSearchTimer = setTimeout(teacherSearchStudentsForScoreNow, 250);
}

async function teacherSearchStudentsForScoreNow(){
  const token = getTeacherToken();
  const courseId = val('teacherScoreCourse');
  const search = val('scoreStudentSearch');
  const box = document.getElementById('scoreStudentResults');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');

  if(!search){
    box.innerHTML = '<div class="note">พิมพ์รหัสหรือชื่อเพื่อค้นหา</div>';
    return;
  }

  box.innerHTML = '<div class="note">กำลังค้นหา...</div>';

  try {
    const { data, error } = await sb.rpc('teacher_search_students_for_score_v2', {
      p_token: token,
      p_course_id: courseId,
      p_search: search
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? rows.map(s => `
          <button class="btn-soft small" onclick="selectScoreStudent('${esc(s.student_id)}','${esc(s.full_name)}')">
            ${esc(s.student_id)} ${esc(s.full_name)}
          </button>
        `).join(' ')
      : '<div class="note">ไม่พบนักศึกษา</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">ค้นหาไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

function selectScoreStudent(studentId, fullName){
  document.getElementById('selectedScoreStudentId').value = studentId;
  document.getElementById('selectedScoreStudent').value = `${studentId} ${fullName}`;
}

async function teacherSaveScore(){
  const token = getTeacherToken();
  const courseId = val('teacherScoreCourse');
  const itemColumn = val('teacherScoreAssignment');
  const studentId = val('selectedScoreStudentId');
  const score = Number(val('scoreValue'));
  const comment = val('scoreComment');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!itemColumn) return toast('กรุณาเลือกชิ้นงาน');
  if(!studentId) return toast('กรุณาเลือกนักศึกษา');
  if(Number.isNaN(score)) return toast('กรุณากรอกคะแนน');

  showLoading('กำลังบันทึกคะแนน', 'ระบบกำลังบันทึกคะแนนลงฐานข้อมูล...');

  try {
    const { data, error } = await sb.rpc('teacher_save_score_v2', {
      p_token: token,
      p_course_id: courseId,
      p_student_id: studentId,
      p_item_column: itemColumn,
      p_score: score,
      p_teacher_comment: comment
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'บันทึกคะแนนไม่สำเร็จ');
      return;
    }

    toast('บันทึกคะแนนสำเร็จ');

    document.getElementById('scoreValue').value = '';
    document.getElementById('scoreComment').value = '';

    await teacherLoadScoreReport();

  } catch(err) {
    hideLoading();
    alert('บันทึกคะแนนไม่สำเร็จ: ' + err.message);
  }
}

async function teacherLoadScoreReport(){
  const token = getTeacherToken();
  const courseId = val('teacherScoreCourse');
  const itemColumn = val('teacherScoreAssignment');
  const box = document.getElementById('teacherScoreReportBox');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!itemColumn) return toast('กรุณาเลือกชิ้นงาน');

  box.innerHTML = 'กำลังโหลดรายงานคะแนน...';

  try {
    const { data, error } = await sb.rpc('teacher_get_score_report_v2', {
      p_token: token,
      p_course_id: courseId,
      p_item_column: itemColumn
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ</th>
                <th>คะแนน</th>
                <th>หมายเหตุ</th>
                <th>สถานะซิงค์</th>
                <th>แก้ไขล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.student_id)}</td>
                  <td>${esc(r.full_name)}</td>
                  <td>${r.score ?? '-'}</td>
                  <td>${esc(r.teacher_comment || '-')}</td>
                  <td>${esc(r.sync_status || '-')}</td>
                  <td>${formatDateTime(r.updated_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="note">ยังไม่มีข้อมูลคะแนน</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดรายงานไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function syncScoresToGoogleSheet(){
  const token = getTeacherToken();
  const courseId = val('teacherScoreCourse');
  const itemColumn = val('teacherScoreAssignment');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!itemColumn) return toast('กรุณาเลือกชิ้นงาน');

  if(!BRIDGE_URL || BRIDGE_URL.includes('ใส่')){
    return toast('ยังไม่ได้ตั้งค่า BRIDGE_URL ใน config.js');
  }

  showLoading('กำลังซิงค์คะแนน', 'ระบบกำลังเขียนคะแนนลง Google Sheet...');

  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'syncScoresToSheet',
        courseId: courseId,
        itemColumn: itemColumn
      })
    });

    const data = await res.json();

    hideLoading();

    if(!data.ok){
      alert(data.message || 'ซิงค์คะแนนไม่สำเร็จ');
      return;
    }

    const d = data.data || {};

    alert(
      'ซิงค์คะแนนสำเร็จ\n' +
      'รายวิชา: ' + (d.courseName || '-') + '\n' +
      'ชีต: ' + (d.sheetName || '-') + '\n' +
      'คอลัมน์: ' + (d.itemColumn || '-') + '\n' +
      'อัปเดต: ' + (d.updated || 0) + ' รายการ\n' +
      'ไม่พบรหัสในชีต: ' + (d.missing || 0) + ' รายการ'
    );

    await teacherLoadScoreReport();

  } catch(err) {
    hideLoading();
    alert('ซิงค์คะแนนไม่สำเร็จ: ' + err.message);
  }
}

// =====================================================
// PHASE 9 - Materials + Download Files
// =====================================================

const MAX_MATERIAL_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_MATERIAL_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png'
];

const ALLOWED_DOWNLOAD_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
];

async function openMaterialsPage(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');
  showPage('pageMaterials');
  await loadStudentMaterials();
}

async function loadStudentMaterials(){
  const box = document.getElementById('studentMaterialsBox');
  box.innerHTML = 'กำลังโหลดเอกสาร...';

  try {
    const { data, error } = await sb.rpc('student_get_materials_v2', {
      p_course_id: STUDENT.course_id
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? rows.map(r => `
          <div class="student-row">
            <div>
              <b>${esc(r.title)}</b><br>
              <small>${esc(r.description || '-')}</small><br>
              <small>ไฟล์: ${esc(r.file_name || '-')}</small>
            </div>
            <a class="btn-soft small" target="_blank" href="${esc(r.file_url)}">เปิดไฟล์</a>
          </div>
        `).join('')
      : '<div class="note">ยังไม่มีเอกสารประกอบการเรียน</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดเอกสารไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function openDownloadFilesPage(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');
  showPage('pageDownloadFiles');
  await loadDownloadFiles();
}

async function loadDownloadFiles(){
  const box = document.getElementById('downloadFilesBox');
  box.innerHTML = 'กำลังโหลดไฟล์...';

  try {
    const { data, error } = await sb.rpc('student_get_download_files_v2');

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? rows.map(r => `
          <div class="student-row">
            <div>
              <b>${esc(r.title)}</b><br>
              <small>${esc(r.description || '-')}</small><br>
              <small>ไฟล์: ${esc(r.file_name || '-')}</small>
            </div>
            <a class="btn-soft small" target="_blank" href="${esc(r.file_url)}">ดาวน์โหลด</a>
          </div>
        `).join('')
      : '<div class="note">ยังไม่มีไฟล์ดาวน์โหลด</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดไฟล์ไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function teacherPrepareFilesPage(){
  await refreshTeacherCourses();
  await teacherLoadMaterials();
  await teacherLoadDownloadFiles();
}

async function teacherUploadMaterial(){
  const token = getTeacherToken();
  const courseId = val('teacherMaterialCourse');
  const title = val('materialTitle');
  const description = val('materialDescription');
  const fileInput = document.getElementById('materialFile');
  const file = fileInput.files[0];

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!title) return toast('กรุณากรอกชื่อเอกสาร');
  if(!file) return toast('กรุณาแนบไฟล์เอกสาร');

  if(file.size > MAX_MATERIAL_FILE_SIZE) return toast('ไฟล์ใหญ่เกิน 20 MB');
  if(!ALLOWED_MATERIAL_TYPES.includes(file.type)) return toast('ไม่รองรับชนิดไฟล์นี้');

  showLoading('กำลังอัปโหลดเอกสาร', 'ระบบกำลังบันทึกเอกสารประกอบการเรียน...');

  try {
    const safeName = makeSafeFileName(file.name);
    const path = `${courseId}/material_${Date.now()}_${safeName}`;

    const upload = await sb.storage
      .from('materials')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if(upload.error) throw upload.error;

    const publicUrl = sb.storage
      .from('materials')
      .getPublicUrl(path)
      .data
      .publicUrl;

    const { data, error } = await sb.rpc('teacher_create_material_v2', {
      p_token: token,
      p_course_id: courseId,
      p_title: title,
      p_description: description,
      p_file_url: publicUrl,
      p_file_name: file.name
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'อัปโหลดไม่สำเร็จ');
      return;
    }

    toast('อัปโหลดเอกสารสำเร็จ');

    document.getElementById('materialTitle').value = '';
    document.getElementById('materialDescription').value = '';
    document.getElementById('materialFile').value = '';

    await teacherLoadMaterials();

  } catch(err) {
    hideLoading();
    alert('อัปโหลดเอกสารไม่สำเร็จ: ' + err.message);
  }
}

async function teacherLoadMaterials(){
  const token = getTeacherToken();
  const courseId = val('teacherMaterialCourse');
  const box = document.getElementById('teacherMaterialsBox');

  if(!box) return;
  if(!token) return;
  if(!courseId){
    box.innerHTML = '<div class="note">กรุณาเลือกรายวิชา</div>';
    return;
  }

  box.innerHTML = 'กำลังโหลดเอกสาร...';

  try {
    const { data, error } = await sb.rpc('teacher_get_materials_v2', {
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
      ? rows.map(r => `
          <div class="student-row">
            <div>
              <b>${esc(r.title)}</b><br>
              <small>${esc(r.description || '-')}</small><br>
              <small>สถานะ: ${esc(r.status || '-')} | ${formatDateTime(r.created_at)}</small>
            </div>
            <a class="btn-soft small" target="_blank" href="${esc(r.file_url)}">เปิดไฟล์</a>
          </div>
        `).join('')
      : '<div class="note">ยังไม่มีเอกสาร</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดเอกสารไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function teacherUploadDownloadFile(){
  const token = getTeacherToken();
  const title = val('downloadTitle');
  const description = val('downloadDescription');
  const fileInput = document.getElementById('downloadFile');
  const file = fileInput.files[0];

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!title) return toast('กรุณากรอกชื่อไฟล์');
  if(!file) return toast('กรุณาแนบไฟล์');

  if(file.size > MAX_MATERIAL_FILE_SIZE) return toast('ไฟล์ใหญ่เกิน 20 MB');
  if(!ALLOWED_DOWNLOAD_TYPES.includes(file.type)) return toast('รองรับเฉพาะ PDF, DOC, DOCX, JPG, PNG');

  showLoading('กำลังอัปโหลดไฟล์', 'ระบบกำลังบันทึกไฟล์ดาวน์โหลด...');

  try {
    const safeName = makeSafeFileName(file.name);
    const path = `download_${Date.now()}_${safeName}`;

    const upload = await sb.storage
      .from('download-files')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if(upload.error) throw upload.error;

    const publicUrl = sb.storage
      .from('download-files')
      .getPublicUrl(path)
      .data
      .publicUrl;

    const { data, error } = await sb.rpc('teacher_create_download_file_v2', {
      p_token: token,
      p_title: title,
      p_description: description,
      p_file_url: publicUrl,
      p_file_name: file.name
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'อัปโหลดไม่สำเร็จ');
      return;
    }

    toast('อัปโหลดไฟล์ดาวน์โหลดสำเร็จ');

    document.getElementById('downloadTitle').value = '';
    document.getElementById('downloadDescription').value = '';
    document.getElementById('downloadFile').value = '';

    await teacherLoadDownloadFiles();

  } catch(err) {
    hideLoading();
    alert('อัปโหลดไฟล์ไม่สำเร็จ: ' + err.message);
  }
}

async function teacherLoadDownloadFiles(){
  const token = getTeacherToken();
  const box = document.getElementById('teacherDownloadFilesBox');

  if(!box) return;
  if(!token) return;

  box.innerHTML = 'กำลังโหลดไฟล์ดาวน์โหลด...';

  try {
    const { data, error } = await sb.rpc('teacher_get_download_files_v2', {
      p_token: token
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? rows.map(r => `
          <div class="student-row">
            <div>
              <b>${esc(r.title)}</b><br>
              <small>${esc(r.description || '-')}</small><br>
              <small>สถานะ: ${esc(r.status || '-')} | ${formatDateTime(r.created_at)}</small>
            </div>
            <a class="btn-soft small" target="_blank" href="${esc(r.file_url)}">เปิดไฟล์</a>
          </div>
        `).join('')
      : '<div class="note">ยังไม่มีไฟล์ดาวน์โหลด</div>';

  } catch(err) {
    box.innerHTML = `<div class="note">โหลดไฟล์ดาวน์โหลดไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

// =====================================================
// FIX PHASE 9 - Ensure teacher material course dropdown works
// วางท้ายไฟล์ app.js ได้เลย
// =====================================================

async function refreshTeacherCourses(){
  await loadCourses();

  const html = COURSES.length
    ? COURSES.map(c => `<option value="${esc(c.id)}">${esc(c.display_name || c.course_name)}</option>`).join('')
    : '<option value="">ยังไม่มีรายวิชา</option>';

  [
    'teacherDashboardCourse',
    'teacherStudentCourse',
    'teacherAttendanceCourse',
    'teacherAssignmentCourse',
    'teacherLeaveCourse',
    'teacherScoreCourse',
    'teacherMaterialCourse'
  ]
    
  [
    'teacherStudentCourse',
    'teacherAttendanceCourse',
    'teacherAssignmentCourse',
    'teacherLeaveCourse',
    'teacherScoreCourse',
    'teacherMaterialCourse'
  ].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = html;
  });

  renderCourses();
}

async function teacherPrepareFilesPage(){
  await refreshTeacherCourses();

  const materialCourse = document.getElementById('teacherMaterialCourse');
  if(materialCourse && materialCourse.value){
    await teacherLoadMaterials();
  }

  await teacherLoadDownloadFiles();
}

// =====================================================
// PHASE 10 - AI Review
// =====================================================

async function teacherRunAIReview(){
  const token = getTeacherToken();
  const courseId = val('teacherScoreCourse');
  const itemColumn = val('teacherScoreAssignment');
  const studentId = val('selectedScoreStudentId');
  const rubric = val('aiRubric');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!itemColumn) return toast('กรุณาเลือกชิ้นงาน');
  if(!studentId) return toast('กรุณาเลือกนักศึกษา');

  if(!BRIDGE_URL || BRIDGE_URL.includes('ใส่')){
    return toast('ยังไม่ได้ตั้งค่า BRIDGE_URL ใน config.js');
  }

  showLoading('AI กำลังตรวจงาน', 'ระบบกำลังอ่านไฟล์งานและประเมินคะแนน...');

  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'runAIReview',
        courseId: courseId,
        itemColumn: itemColumn,
        studentId: studentId,
        rubric: rubric
      })
    });

    const data = await res.json();

    hideLoading();

    if(!data.ok){
      alert(data.message || 'AI ตรวจงานไม่สำเร็จ');
      return;
    }

    const d = data.data || {};

    document.getElementById('aiReviewId').value = d.reviewId || '';
    document.getElementById('aiFinalScore').value = d.aiScore ?? '';
    document.getElementById('aiCommentBox').value = d.aiComment || '';

    toast('AI ตรวจงานสำเร็จ');

  } catch(err) {
    hideLoading();
    alert('AI ตรวจงานไม่สำเร็จ: ' + err.message);
  }
}

async function teacherConfirmAIReview(){
  const token = getTeacherToken();
  const reviewId = val('aiReviewId');
  const finalScore = Number(val('aiFinalScore'));
  const comment = val('aiCommentBox');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!reviewId) return toast('ยังไม่มีผลตรวจ AI ให้ยืนยัน');
  if(Number.isNaN(finalScore)) return toast('กรุณากรอกคะแนนที่ต้องการยืนยัน');

  showLoading('กำลังยืนยันคะแนน', 'ระบบกำลังบันทึกคะแนนจากผลตรวจ AI...');

  try {
    const { data, error } = await sb.rpc('teacher_confirm_ai_review_v2', {
      p_token: token,
      p_ai_review_id: reviewId,
      p_final_score: finalScore,
      p_teacher_comment: comment
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'ยืนยันคะแนนไม่สำเร็จ');
      return;
    }

    toast('ยืนยันคะแนนสำเร็จ');

    await teacherLoadScoreReport();

  } catch(err) {
    hideLoading();
    alert('ยืนยันคะแนนไม่สำเร็จ: ' + err.message);
  }
}

// =====================================================
// PHASE 11 - Teacher Dashboard / System Health
// =====================================================

async function teacherPrepareDashboard(){
  await refreshTeacherCourses();
  await teacherLoadDashboard();
}

async function teacherLoadDashboard(){
  const token = getTeacherToken();
  const courseId = val('teacherDashboardCourse');
  const summaryBox = document.getElementById('teacherDashboardSummary');
  const assignmentBox = document.getElementById('teacherDashboardAssignments');

  if(!summaryBox || !assignmentBox) return;
  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  if(!courseId){
    summaryBox.innerHTML = '<div class="note">กรุณาเลือกรายวิชา</div>';
    assignmentBox.innerHTML = '';
    return;
  }

  summaryBox.innerHTML = 'กำลังโหลด Dashboard...';
  assignmentBox.innerHTML = '';

  try {
    const { data, error } = await sb.rpc('teacher_get_dashboard_v2', {
      p_token: token,
      p_course_id: courseId
    });

    if(error) throw error;

    if(!data.ok){
      summaryBox.innerHTML = `<div class="note">${esc(data.message || 'โหลด Dashboard ไม่สำเร็จ')}</div>`;
      return;
    }

    const d = data.data || {};
    const latest = d.latest_attendance;

    summaryBox.innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-card dashboard-good">
          <b>นักศึกษาทั้งหมด</b>
          <div class="dashboard-num">${esc(d.students || 0)}</div>
          <small>คน</small>
        </div>

        <div class="dashboard-card">
          <b>ชิ้นงานที่เปิดใช้</b>
          <div class="dashboard-num">${esc(d.assignments || 0)}</div>
          <small>ชิ้นงาน</small>
        </div>

        <div class="dashboard-card ${Number(d.submission_missing || 0) > 0 ? 'dashboard-warn' : 'dashboard-good'}">
          <b>รายการงานที่ยังไม่ส่ง</b>
          <div class="dashboard-num">${esc(d.submission_missing || 0)}</div>
          <small>รวมทุกชิ้นงาน</small>
        </div>

        <div class="dashboard-card ${Number(d.pending_leaves || 0) > 0 ? 'dashboard-warn' : 'dashboard-good'}">
          <b>ใบลารอรับทราบ</b>
          <div class="dashboard-num">${esc(d.pending_leaves || 0)}</div>
          <small>รายการ</small>
        </div>

        <div class="dashboard-card ${Number(d.pending_scores || 0) > 0 ? 'dashboard-warn' : 'dashboard-good'}">
          <b>คะแนนรอซิงค์</b>
          <div class="dashboard-num">${esc(d.pending_scores || 0)}</div>
          <small>รายการ</small>
        </div>

        <div class="dashboard-card ${Number(d.pending_ai || 0) > 0 ? 'dashboard-warn' : 'dashboard-good'}">
          <b>AI รอยืนยัน</b>
          <div class="dashboard-num">${esc(d.pending_ai || 0)}</div>
          <small>รายการ</small>
        </div>

        <div class="dashboard-card">
          <b>เช็คชื่อล่าสุด</b>
          <div class="dashboard-num">${latest ? esc(latest.checked_count || 0) : '-'}</div>
          <small>
            ${latest
              ? `ครั้งที่ ${esc(latest.session_no || '-')} | ${esc(latest.status || '-')}`
              : 'ยังไม่มีรอบเช็คชื่อ'}
          </small>
        </div>
      </div>
    `;

    const rows = d.assignment_rows || [];

    assignmentBox.innerHTML = rows.length
      ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชิ้นงาน</th>
                <th>คะแนนเต็ม</th>
                <th>ส่งแล้ว</th>
                <th>ยังไม่ส่ง</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.title || '-')}</td>
                  <td>${esc(r.max_score || '-')}</td>
                  <td><span class="check">${esc(r.submitted_count || 0)}</span></td>
                  <td>${Number(r.missing_count || 0) > 0
                    ? `<span class="miss">${esc(r.missing_count)}</span>`
                    : '<span class="check">0</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="note">ยังไม่มีชิ้นงานสำหรับรายวิชานี้</div>';

  } catch(err) {
    summaryBox.innerHTML = `<div class="note">โหลด Dashboard ไม่สำเร็จ: ${esc(err.message)}</div>`;
    assignmentBox.innerHTML = '';
  }
}

// =====================================================
// FIX LOGIN ERROR: Cannot read properties of undefined (reading 'forEach')
// วางท้ายไฟล์ app.js ได้เลย
// =====================================================

async function loadCourses(){
  try {
    const { data, error } = await sb
      .from('courses')
      .select('id, course_name, display_name')
      .eq('status', 'ใช้งาน')
      .order('created_at', { ascending:true });

    if(error) throw error;

    COURSES = Array.isArray(data) ? data : [];
    return COURSES;

  } catch(err) {
    COURSES = [];
    console.error('loadCourses error:', err);
    throw err;
  }
}

async function refreshTeacherCourses(){
  await loadCourses();

  const html = Array.isArray(COURSES) && COURSES.length
    ? COURSES.map(c => `<option value="${esc(c.id)}">${esc(c.display_name || c.course_name || 'ไม่ระบุชื่อรายวิชา')}</option>`).join('')
    : '<option value="">ยังไม่มีรายวิชา</option>';

  const targetIds = [
    'teacherDashboardCourse',
    'teacherStudentCourse',
    'teacherAttendanceCourse',
    'teacherAssignmentCourse',
    'teacherLeaveCourse',
    'teacherScoreCourse',
    'teacherMaterialCourse'
  ];

  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = html;
  });

  if(typeof renderCourses === 'function'){
    renderCourses();
  }
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

    if(!data || !data.ok){
      hideLoading();
      toast((data && data.message) || 'เข้าสู่ระบบไม่สำเร็จ');
      return;
    }

    TEACHER = data.data || {};
    localStorage.setItem('teacher_token', TEACHER.token || '');
    localStorage.setItem('teacher_name', TEACHER.teacher_name || 'Admin');

    const teacherInfo = document.getElementById('teacherInfo');
    if(teacherInfo){
      teacherInfo.innerText = 'เข้าสู่ระบบแล้ว: ' + (TEACHER.teacher_name || TEACHER.username || 'Admin');
    }

    await refreshTeacherCourses();

    hideLoading();

    showPage('pageTeacherPanel');

    // ถ้ามี Dashboard แล้ว ให้เปิด Dashboard
    if(document.getElementById('teacherDashboardBox')){
      teacherTab('teacherDashboardBox');

      if(typeof teacherPrepareDashboard === 'function'){
        await teacherPrepareDashboard();
      }
    }

  } catch(err) {
    hideLoading();
    alert('เข้าสู่ระบบอาจารย์ไม่สำเร็จ: ' + (err.message || err));
  }
}

async function teacherPrepareDashboard(){
  await refreshTeacherCourses();

  const dashboardBox = document.getElementById('teacherDashboardBox');
  const dashboardCourse = document.getElementById('teacherDashboardCourse');

  if(!dashboardBox || !dashboardCourse){
    return;
  }

  if(typeof teacherLoadDashboard === 'function'){
    await teacherLoadDashboard();
  }
}

// =====================================================
// PHASE 12 - Stability / Settings / System Health
// =====================================================

let GLOBAL_BUSY = false;

function normalizeErrorMessage(err){
  const msg = String(err?.message || err || '');

  if(msg.includes('Failed to fetch')){
    return 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตหรือลองใหม่อีกครั้ง';
  }

  if(msg.includes('permission denied')){
    return 'ระบบยังไม่ได้รับสิทธิ์เข้าถึงข้อมูล กรุณาตรวจสิทธิ์ใน Supabase';
  }

  if(msg.includes('JWT') || msg.includes('token')){
    return 'สิทธิ์การใช้งานหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  }

  if(msg.includes('Storage') || msg.includes('bucket')){
    return 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาตรวจชนิดไฟล์หรือพื้นที่จัดเก็บ';
  }

  if(msg.includes('Invalid key')){
    return 'ชื่อไฟล์ไม่ถูกต้อง กรุณาเปลี่ยนชื่อไฟล์เป็นภาษาอังกฤษแล้วลองใหม่';
  }

  return msg || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

function setBusyButtons(isBusy){
  GLOBAL_BUSY = isBusy;

  document.querySelectorAll('button').forEach(btn => {
    if(isBusy){
      btn.dataset.oldDisabled = btn.disabled ? '1' : '0';
      btn.disabled = true;
    }else{
      if(btn.dataset.oldDisabled === '0'){
        btn.disabled = false;
      }
    }
  });
}

function safeToast(msg){
  toast(String(msg || '').replace(/\s+/g, ' ').trim());
}

async function teacherUpdateStudentSystem(){
  const token = getTeacherToken();
  const status = val('studentSystemStatus');
  const message = val('studentSystemMessage');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  showLoading('กำลังบันทึกการตั้งค่า', 'ระบบกำลังอัปเดตสถานะนักศึกษา...');

  try {
    const { data, error } = await sb.rpc('teacher_update_student_system_v2', {
      p_token: token,
      p_status: status,
      p_message: message
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'บันทึกไม่สำเร็จ');
      return;
    }

    toast('บันทึกสถานะระบบสำเร็จ');
    await loadSettings();

  } catch(err) {
    hideLoading();
    alert('บันทึกไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

async function teacherLoadSystemHealth(){
  const token = getTeacherToken();
  const box = document.getElementById('systemHealthBox');

  if(!box) return;
  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');

  box.innerHTML = 'กำลังตรวจสอบระบบ...';

  try {
    const { data, error } = await sb.rpc('teacher_get_system_health_v2', {
      p_token: token
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="note">${esc(data.message || 'ตรวจสอบไม่สำเร็จ')}</div>`;
      return;
    }

    const d = data.data || {};

    const statusEl = document.getElementById('studentSystemStatus');
    const messageEl = document.getElementById('studentSystemMessage');

    if(statusEl) statusEl.value = d.student_system_status || 'เปิดใช้งาน';
    if(messageEl) messageEl.value = d.student_system_message || '';

    box.innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-card ${d.student_system_status === 'เปิดใช้งาน' ? 'dashboard-good' : 'dashboard-warn'}">
          <b>ระบบนักศึกษา</b>
          <div class="dashboard-num" style="font-size:24px">${esc(d.student_system_status || '-')}</div>
          <small>${esc(d.student_system_message || '-')}</small>
        </div>

        <div class="dashboard-card">
          <b>รายวิชา</b>
          <div class="dashboard-num">${esc(d.courses || 0)}</div>
          <small>วิชา</small>
        </div>

        <div class="dashboard-card">
          <b>นักศึกษา</b>
          <div class="dashboard-num">${esc(d.students || 0)}</div>
          <small>คน</small>
        </div>

        <div class="dashboard-card">
          <b>ชิ้นงาน</b>
          <div class="dashboard-num">${esc(d.assignments || 0)}</div>
          <small>ชิ้นงาน</small>
        </div>

        <div class="dashboard-card">
          <b>งานที่ส่งแล้ว</b>
          <div class="dashboard-num">${esc(d.submissions || 0)}</div>
          <small>รายการ</small>
        </div>

        <div class="dashboard-card ${Number(d.scores_pending || 0) > 0 ? 'dashboard-warn' : 'dashboard-good'}">
          <b>คะแนนรอซิงค์</b>
          <div class="dashboard-num">${esc(d.scores_pending || 0)}</div>
          <small>รายการ</small>
        </div>
      </div>
    `;

  } catch(err) {
    box.innerHTML = `<div class="note">ตรวจสอบระบบไม่สำเร็จ: ${esc(normalizeErrorMessage(err))}</div>`;
  }
}

// =====================================================
// PHASE 13 - Export / Backup CSV
// =====================================================

async function teacherPrepareExportPage(){
  await refreshTeacherCourses();
}

async function teacherExportCSV(){
  const token = getTeacherToken();
  const courseId = val('teacherExportCourse');
  const exportType = val('teacherExportType');
  const box = document.getElementById('teacherExportBoxResult');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!exportType) return toast('กรุณาเลือกประเภทข้อมูล');

  if(box) box.innerHTML = 'กำลังเตรียมไฟล์ CSV...';

  showLoading('กำลัง Export ข้อมูล', 'ระบบกำลังรวบรวมข้อมูลและสร้างไฟล์ CSV...');

  try {
    const { data, error } = await sb.rpc('teacher_export_data_v2', {
      p_token: token,
      p_course_id: courseId,
      p_export_type: exportType
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      if(box) box.innerHTML = `<div class="note">${esc(data.message || 'Export ไม่สำเร็จ')}</div>`;
      toast(data.message || 'Export ไม่สำเร็จ');
      return;
    }

    const rows = data.data || [];

    if(!rows.length){
      if(box) box.innerHTML = '<div class="note">ไม่มีข้อมูลสำหรับส่งออก</div>';
      toast('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    const courseName = getSelectedText('teacherExportCourse') || 'course';
    const fileName = buildExportFileName(courseName, exportType);

    downloadCSV(rows, fileName);

    if(box){
      box.innerHTML = `<div class="note">Export สำเร็จ: ${esc(rows.length)} รายการ<br>ไฟล์: ${esc(fileName)}</div>`;
    }

    toast('ดาวน์โหลด CSV สำเร็จ');

  } catch(err) {
    hideLoading();
    const msg = typeof normalizeErrorMessage === 'function'
      ? normalizeErrorMessage(err)
      : (err.message || err);

    if(box) box.innerHTML = `<div class="note">Export ไม่สำเร็จ: ${esc(msg)}</div>`;
    alert('Export ไม่สำเร็จ: ' + msg);
  }
}

function downloadCSV(rows, fileName){
  const headers = Object.keys(rows[0] || {});
  const csvRows = [];

  csvRows.push(headers.map(csvEscape).join(','));

  rows.forEach(row => {
    csvRows.push(
      headers.map(h => csvEscape(row[h])).join(',')
    );
  });

  // ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยง่ายขึ้น
  const csvContent = '\uFEFF' + csvRows.join('\n');

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value){
  if(value === null || value === undefined) return '';

  const text = String(value)
    .replace(/\r?\n|\r/g, ' ')
    .replace(/"/g, '""');

  return `"${text}"`;
}

function buildExportFileName(courseName, exportType){
  const typeMap = {
    students: 'students',
    submissions: 'submissions',
    scores: 'scores',
    leave: 'leave',
    special_scores: 'special_scores',
    attendance: 'attendance'
  };

  const safeCourse = String(courseName || 'course')
    .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

  const date = new Date().toISOString().slice(0, 10);

  return `${safeCourse}_${typeMap[exportType] || exportType}_${date}.csv`;
}

function getSelectedText(selectId){
  const el = document.getElementById(selectId);
  if(!el || !el.options || el.selectedIndex < 0) return '';
  return el.options[el.selectedIndex].text || '';
}

// =====================================================
// UI REVAMP PHASE 1
// Active Sidebar Button + Safe Teacher Tab
// วางท้ายไฟล์ app.js ได้เลย
// =====================================================

function teacherTab(id){
  document.querySelectorAll('.teacher-box').forEach(x => {
    x.classList.remove('active');
  });

  const target = document.getElementById(id);
  if(target){
    target.classList.add('active');
  }

  document.querySelectorAll('#pageTeacherPanel .teacher-tabs button').forEach(btn => {
    btn.classList.remove('active-tab');

    const click = btn.getAttribute('onclick') || '';
    if(click.includes(id)){
      btn.classList.add('active-tab');
    }
  });

  window.scrollTo({ top:0, behavior:'smooth' });
}

// =====================================================
// FINAL FIX - Teacher Course Dropdowns + Export Course
// วางท้ายไฟล์ app.js ได้เลย
// =====================================================

async function loadCourses(){
  try {
    const { data, error } = await sb
      .from('courses')
      .select('id, course_name, display_name')
      .eq('status', 'ใช้งาน')
      .order('created_at', { ascending:true });

    if(error) throw error;

    COURSES = Array.isArray(data) ? data : [];
    return COURSES;

  } catch(err) {
    COURSES = [];
    console.error('loadCourses error:', err);
    throw err;
  }
}

async function refreshTeacherCourses(){
  await loadCourses();

  const html = Array.isArray(COURSES) && COURSES.length
    ? COURSES.map(c => `
        <option value="${esc(c.id)}">
          ${esc(c.display_name || c.course_name || 'ไม่ระบุชื่อรายวิชา')}
        </option>
      `).join('')
    : '<option value="">ยังไม่มีรายวิชา</option>';

  const targetIds = [
    'teacherDashboardCourse',
    'teacherStudentCourse',
    'teacherAttendanceCourse',
    'teacherAssignmentCourse',
    'teacherLeaveCourse',
    'teacherScoreCourse',
    'teacherMaterialCourse',
    'teacherExportCourse'
  ];

  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = html;
  });

  if(typeof renderCourses === 'function'){
    renderCourses();
  }
}

async function teacherPrepareExportPage(){
  await refreshTeacherCourses();
}

// =====================================================
// UI FIX - Collapsible Teacher Sidebar
// เพิ่มปุ่ม ☰ เพื่อซ่อน/แสดง Sidebar
// =====================================================

function ensureTeacherSidebarToggle(){
  const panel = document.getElementById('pageTeacherPanel');
  if(!panel) return;

  if(document.getElementById('teacherSidebarToggle')) return;

  const btn = document.createElement('button');
  btn.id = 'teacherSidebarToggle';
  btn.className = 'teacher-sidebar-toggle';
  btn.innerHTML = '☰ เมนู';
  btn.onclick = toggleTeacherSidebar;

  panel.prepend(btn);
}

function toggleTeacherSidebar(){
  document.body.classList.toggle('teacher-sidebar-hidden');

  const btn = document.getElementById('teacherSidebarToggle');
  if(btn){
    btn.innerHTML = document.body.classList.contains('teacher-sidebar-hidden')
      ? '☰ เมนู'
      : '✕ ปิดเมนู';
  }
}

// เรียกใช้เมื่อเปิดหน้าอาจารย์
const oldTeacherTabForSidebar = teacherTab;

teacherTab = function(id){
  ensureTeacherSidebarToggle();

  document.querySelectorAll('.teacher-box').forEach(x => {
    x.classList.remove('active');
  });

  const target = document.getElementById(id);
  if(target){
    target.classList.add('active');
  }

  document.querySelectorAll('#pageTeacherPanel .teacher-tabs button').forEach(btn => {
    btn.classList.remove('active-tab');

    const click = btn.getAttribute('onclick') || '';
    if(click.includes(id)){
      btn.classList.add('active-tab');
    }
  });

  window.scrollTo({ top:0, behavior:'smooth' });
};

// =====================================================
// UI REVAMP PHASE 3 - Selected student UX
// =====================================================

function selectScoreStudent(studentId, fullName){
  const idEl = document.getElementById('selectedScoreStudentId');
  const nameEl = document.getElementById('selectedScoreStudent');
  const searchEl = document.getElementById('scoreStudentSearch');
  const resultsEl = document.getElementById('scoreStudentResults');

  if(idEl) idEl.value = studentId;
  if(nameEl) nameEl.value = `${studentId} ${fullName}`;

  if(searchEl) searchEl.value = '';
  if(resultsEl){
    resultsEl.innerHTML = `
      <div class="student-row" style="width:100%;">
        <div>
          <b>${esc(studentId)} ${esc(fullName)}</b><br>
          <small>เลือกนักศึกษาคนนี้แล้ว สามารถกรอกคะแนนหรือใช้ AI ตรวจงานได้</small>
        </div>
        <span class="status-pill">เลือกแล้ว</span>
      </div>
    `;
  }
}

// =====================================================
// UI REVAMP PHASE 4 - Student File Cards
// =====================================================

async function loadStudentMaterials(){
  const box = document.getElementById('studentMaterialsBox');
  if(!box) return;

  box.innerHTML = 'กำลังโหลดเอกสาร...';

  try {
    const { data, error } = await sb.rpc('student_get_materials_v2', {
      p_course_id: STUDENT.course_id
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="student-empty">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? `<div class="student-list-grid">
          ${rows.map(r => `
            <div class="student-file-card">
              <div>
                <span class="student-badge">เอกสาร</span><br><br>
                <b>${esc(r.title)}</b><br>
                <small>${esc(r.description || '-')}</small><br>
                <small>ไฟล์: ${esc(r.file_name || '-')}</small>
              </div>
              <a class="btn-main" target="_blank" href="${esc(r.file_url)}">เปิดไฟล์</a>
            </div>
          `).join('')}
        </div>`
      : '<div class="student-empty">ยังไม่มีเอกสารประกอบการเรียน</div>';

  } catch(err) {
    box.innerHTML = `<div class="student-empty">โหลดเอกสารไม่สำเร็จ: ${esc(normalizeErrorMessage(err))}</div>`;
  }
}

async function loadDownloadFiles(){
  const box = document.getElementById('downloadFilesBox');
  if(!box) return;

  box.innerHTML = 'กำลังโหลดไฟล์...';

  try {
    const { data, error } = await sb.rpc('student_get_download_files_v2');

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = `<div class="student-empty">${esc(data.message)}</div>`;
      return;
    }

    const rows = data.data || [];

    box.innerHTML = rows.length
      ? `<div class="student-list-grid">
          ${rows.map(r => `
            <div class="student-file-card">
              <div>
                <span class="student-badge">ดาวน์โหลด</span><br><br>
                <b>${esc(r.title)}</b><br>
                <small>${esc(r.description || '-')}</small><br>
                <small>ไฟล์: ${esc(r.file_name || '-')}</small>
              </div>
              <a class="btn-main" target="_blank" href="${esc(r.file_url)}">ดาวน์โหลด</a>
            </div>
          `).join('')}
        </div>`
      : '<div class="student-empty">ยังไม่มีไฟล์ดาวน์โหลด</div>';

  } catch(err) {
    box.innerHTML = `<div class="student-empty">โหลดไฟล์ไม่สำเร็จ: ${esc(normalizeErrorMessage(err))}</div>`;
  }
}

// =====================================================
// UI REVAMP PHASE 5 - Helpers
// Modern badges / tables
// =====================================================

function statusBadge(status){
  const s = String(status || '-');

  if(['ส่งแล้ว','เช็คแล้ว','ซิงค์แล้ว','รับทราบ','เปิดใช้งาน','มาเรียน','ยืนยันแล้ว'].includes(s)){
    return `<span class="status-badge good">✓ ${esc(s)}</span>`;
  }

  if(['ยังไม่ส่ง','ยังไม่เช็ค','รอซิงค์','รอยืนยัน','ส่งแล้ว'].includes(s)){
    return `<span class="status-badge warn">${esc(s)}</span>`;
  }

  if(['ไม่อนุมัติ','ปิดใช้งาน','ถอนรายชื่อ'].includes(s)){
    return `<span class="status-badge danger">${esc(s)}</span>`;
  }

  if(['เปิด','กำลังดำเนินการ'].includes(s)){
    return `<span class="status-badge info">${esc(s)}</span>`;
  }

  if(['ปิด'].includes(s)){
    return `<span class="status-badge gray">${esc(s)}</span>`;
  }

  return `<span class="status-badge gray">${esc(s)}</span>`;
}

function modernEmpty(text){
  return `<div class="student-empty">${esc(text || 'ยังไม่มีข้อมูล')}</div>`;
}

function modernTable(headers, rowsHtml){
  return `
    <div class="table-wrap">
      <table class="modern-table">
        <thead>
          <tr>
            ${headers.map(h => `<th>${esc(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

// =====================================================
// UI REVAMP PHASE 5 - Student submission status table
// =====================================================

async function loadStudentSubmissionStatus(){
  const box = document.getElementById('submissionStatusBox');
  if(!box) return;

  box.innerHTML = 'กำลังโหลดสถานะ...';

  try {
    const { data, error } = await sb.rpc('student_get_submission_status_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = modernEmpty(data.message || 'โหลดสถานะไม่สำเร็จ');
      return;
    }

    const rows = data.data || [];

    if(!rows.length){
      box.innerHTML = modernEmpty('ยังไม่มีชิ้นงานที่เปิดให้ส่ง');
      return;
    }

    box.innerHTML = modernTable(
      ['ชิ้นงาน', 'คะแนนเต็ม', 'สถานะ', 'เวลาส่งล่าสุด', 'ไฟล์'],
      rows.map(r => `
        <tr>
          <td><b>${esc(r.title || '-')}</b></td>
          <td>${esc(r.max_score || '-')}</td>
          <td>${statusBadge(r.status || 'ยังไม่ส่ง')}</td>
          <td>${formatDateTime(r.submitted_at)}</td>
          <td>${r.file_url ? `<a class="compact-link" target="_blank" href="${esc(r.file_url)}">เปิดไฟล์</a>` : '-'}</td>
        </tr>
      `).join('')
    );

  } catch(err) {
    box.innerHTML = modernEmpty('โหลดสถานะไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

// =====================================================
// UI REVAMP PHASE 5 - Student leave history
// =====================================================

async function loadStudentLeaveHistory(){
  if(!STUDENT) return;

  const box = document.getElementById('leaveHistoryBox');
  if(!box) return;

  box.innerHTML = 'กำลังโหลดประวัติการลา...';

  try {
    const { data, error } = await sb.rpc('student_get_leave_history_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = modernEmpty(data.message || 'โหลดประวัติไม่สำเร็จ');
      return;
    }

    const rows = data.data || [];

    if(!rows.length){
      box.innerHTML = modernEmpty('ยังไม่มีประวัติการลา');
      return;
    }

    box.innerHTML = modernTable(
      ['วันที่ส่ง', 'วันที่ลา', 'ประเภท', 'เหตุผล', 'หลักฐาน', 'สถานะ'],
      rows.map(r => `
        <tr>
          <td>${formatDateTime(r.created_at)}</td>
          <td>${esc(r.leave_date || '-')}</td>
          <td>${esc(r.leave_type || '-')}</td>
          <td>${esc(r.reason || '-')}</td>
          <td>${r.file_url ? `<a class="compact-link" target="_blank" href="${esc(r.file_url)}">เปิดหลักฐาน</a>` : '-'}</td>
          <td>${statusBadge(r.status || '-')}</td>
        </tr>
      `).join('')
    );

  } catch(err) {
    box.innerHTML = modernEmpty('โหลดประวัติไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

// =====================================================
// UI REVAMP PHASE 5 - Teacher score report
// =====================================================

async function teacherLoadScoreReport(){
  const token = getTeacherToken();
  const courseId = val('teacherScoreCourse');
  const itemColumn = val('teacherScoreAssignment');
  const box = document.getElementById('teacherScoreReportBox');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!itemColumn) return toast('กรุณาเลือกชิ้นงาน');
  if(!box) return;

  box.innerHTML = 'กำลังโหลดรายงานคะแนน...';

  try {
    const { data, error } = await sb.rpc('teacher_get_score_report_v2', {
      p_token: token,
      p_course_id: courseId,
      p_item_column: itemColumn
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = modernEmpty(data.message || 'โหลดรายงานไม่สำเร็จ');
      return;
    }

    const rows = data.data || [];

    if(!rows.length){
      box.innerHTML = modernEmpty('ยังไม่มีข้อมูลคะแนน');
      return;
    }

    box.innerHTML = `
      <div class="table-toolbar">
        <div>
          <h3>รายงานคะแนน</h3>
          <div class="table-note">แสดงคะแนนของชิ้นงานที่เลือก พร้อมสถานะการซิงค์</div>
        </div>
      </div>
      ${modernTable(
        ['รหัส', 'ชื่อ', 'คะแนน', 'หมายเหตุ', 'สถานะซิงค์', 'แก้ไขล่าสุด'],
        rows.map(r => `
          <tr>
            <td>${esc(r.student_id)}</td>
            <td><b>${esc(r.full_name)}</b></td>
            <td><b>${r.score ?? '-'}</b></td>
            <td>${esc(r.teacher_comment || '-')}</td>
            <td>${statusBadge(r.sync_status || '-')}</td>
            <td>${formatDateTime(r.updated_at)}</td>
          </tr>
        `).join('')
      )}
    `;

  } catch(err) {
    box.innerHTML = modernEmpty('โหลดรายงานไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

// =====================================================
// UI REVAMP PHASE 5 - Teacher leave requests
// =====================================================

async function teacherLoadLeaveRequests(){
  const token = getTeacherToken();
  const courseId = val('teacherLeaveCourse');
  const box = document.getElementById('teacherLeaveBoxList');

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!courseId) return toast('กรุณาเลือกรายวิชา');
  if(!box) return;

  box.innerHTML = 'กำลังโหลดรายการลา...';

  try {
    const { data, error } = await sb.rpc('teacher_get_leave_requests_v2', {
      p_token: token,
      p_course_id: courseId
    });

    if(error) throw error;

    if(!data.ok){
      box.innerHTML = modernEmpty(data.message || 'โหลดรายการไม่สำเร็จ');
      return;
    }

    const rows = data.data || [];

    if(!rows.length){
      box.innerHTML = modernEmpty('ยังไม่มีรายการลาเรียน');
      return;
    }

    box.innerHTML = modernTable(
      ['วันที่ส่ง', 'รหัส', 'ชื่อ', 'วันที่ลา', 'ประเภท', 'หลักฐาน', 'สถานะ', 'จัดการ'],
      rows.map(r => `
        <tr>
          <td>${formatDateTime(r.created_at)}</td>
          <td>${esc(r.student_id)}</td>
          <td><b>${esc(r.full_name)}</b><br><small>${esc(r.reason || '-')}</small></td>
          <td>${esc(r.leave_date || '-')}</td>
          <td>${esc(r.leave_type || '-')}</td>
          <td>${r.file_url ? `<a class="compact-link" target="_blank" href="${esc(r.file_url)}">เปิดหลักฐาน</a>` : '-'}</td>
          <td>${statusBadge(r.status || '-')}</td>
          <td>
            <div class="action-row">
              <button class="btn-soft small" onclick="teacherUpdateLeaveStatus('${esc(r.id)}','รับทราบ')">รับทราบ</button>
              <button class="btn-soft small" onclick="teacherUpdateLeaveStatus('${esc(r.id)}','ไม่อนุมัติ')">ไม่อนุมัติ</button>
            </div>
          </td>
        </tr>
      `).join('')
    );

  } catch(err) {
    box.innerHTML = modernEmpty('โหลดรายการลาไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

// =====================================================
// UI REVAMP PHASE 5 - Student attendance summary
// =====================================================

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

  if(!tableBox) return;

  if(!rows.length){
    tableBox.innerHTML = modernEmpty('วันนี้ยังไม่มีรอบเช็คชื่อ');
    return;
  }

  tableBox.innerHTML = modernTable(
    ['ครั้งที่', 'ชื่อรอบ', 'เวลาเปิด', 'หมดเวลา', 'สถานะ'],
    rows.map(r => `
      <tr>
        <td>${esc(r.session_no || '-')}</td>
        <td><b>${esc(r.session_label || '-')}</b></td>
        <td>${formatDateTime(r.opened_at)}</td>
        <td>${formatDateTime(r.close_at)}</td>
        <td>${statusBadge(r.status === 'เช็คแล้ว' ? 'เช็คแล้ว' : 'ยังไม่เช็ค')}</td>
      </tr>
    `).join('')
  );
}

// =====================================================
// UI REVAMP PHASE 6 - Print + Final UX Helpers
// =====================================================

function printCurrentPage(){
  window.print();
}

function ensurePrintButton(containerId){
  const box = document.getElementById(containerId);
  if(!box) return;

  if(box.querySelector('.print-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'print-btn';
  btn.innerText = 'พิมพ์ / บันทึก PDF';
  btn.onclick = printCurrentPage;

  box.prepend(btn);
}

function addPrintButtonsToReports(){
  [
    'teacherDashboardSummary',
    'teacherScoreReportBox',
    'teacherLeaveBoxList',
    'teacherSubmissionReportBox',
    'teacherExportBoxResult',
    'attendanceTable',
    'submissionStatusBox',
    'leaveHistoryBox'
  ].forEach(id => ensurePrintButton(id));
}

// =====================================================
// UI REVAMP PHASE 6 - Patch report functions to add print button
// =====================================================

const _oldTeacherLoadDashboard = typeof teacherLoadDashboard === 'function' ? teacherLoadDashboard : null;
if(_oldTeacherLoadDashboard){
  teacherLoadDashboard = async function(){
    await _oldTeacherLoadDashboard();
    addPrintButtonsToReports();
  };
}

const _oldTeacherLoadScoreReport = typeof teacherLoadScoreReport === 'function' ? teacherLoadScoreReport : null;
if(_oldTeacherLoadScoreReport){
  teacherLoadScoreReport = async function(){
    await _oldTeacherLoadScoreReport();
    addPrintButtonsToReports();
  };
}

const _oldTeacherLoadLeaveRequests = typeof teacherLoadLeaveRequests === 'function' ? teacherLoadLeaveRequests : null;
if(_oldTeacherLoadLeaveRequests){
  teacherLoadLeaveRequests = async function(){
    await _oldTeacherLoadLeaveRequests();
    addPrintButtonsToReports();
  };
}

const _oldTeacherLoadSubmissionReport = typeof teacherLoadSubmissionReport === 'function' ? teacherLoadSubmissionReport : null;
if(_oldTeacherLoadSubmissionReport){
  teacherLoadSubmissionReport = async function(){
    await _oldTeacherLoadSubmissionReport();
    addPrintButtonsToReports();
  };
}

const _oldLoadStudentSubmissionStatus = typeof loadStudentSubmissionStatus === 'function' ? loadStudentSubmissionStatus : null;
if(_oldLoadStudentSubmissionStatus){
  loadStudentSubmissionStatus = async function(){
    await _oldLoadStudentSubmissionStatus();
    addPrintButtonsToReports();
  };
}

const _oldLoadStudentLeaveHistory = typeof loadStudentLeaveHistory === 'function' ? loadStudentLeaveHistory : null;
if(_oldLoadStudentLeaveHistory){
  loadStudentLeaveHistory = async function(){
    await _oldLoadStudentLeaveHistory();
    addPrintButtonsToReports();
  };
}

// =====================================================
// UI REVAMP PHASE 6 - Mobile sidebar default state
// =====================================================

function applyResponsiveSidebarDefault(){
  if(window.innerWidth <= 900){
    document.body.classList.add('teacher-sidebar-hidden');

    const btn = document.getElementById('teacherSidebarToggle');
    if(btn) btn.innerHTML = '☰ เมนู';
  }
}

window.addEventListener('resize', applyResponsiveSidebarDefault);

const _oldEnsureTeacherSidebarToggle = typeof ensureTeacherSidebarToggle === 'function' ? ensureTeacherSidebarToggle : null;

if(_oldEnsureTeacherSidebarToggle){
  ensureTeacherSidebarToggle = function(){
    _oldEnsureTeacherSidebarToggle();
    applyResponsiveSidebarDefault();
  };
}

// =====================================================
// UI REVAMP PHASE 6 - Better error messages
// =====================================================

function userFriendlyMessage(msg){
  const text = String(msg || '');

  if(text.includes('Failed to fetch')){
    return 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง';
  }

  if(text.includes('permission denied')){
    return 'ระบบยังไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาตรวจการตั้งค่า Supabase';
  }

  if(text.includes('duplicate key')){
    return 'ข้อมูลนี้มีอยู่แล้วในระบบ';
  }

  if(text.includes('Invalid key')){
    return 'ชื่อไฟล์ไม่ถูกต้อง กรุณาเปลี่ยนชื่อไฟล์เป็นภาษาอังกฤษหรือลองอัปโหลดใหม่';
  }

  if(text.includes('JWT') || text.includes('token')){
    return 'สิทธิ์เข้าใช้งานหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  }

  if(text.includes('Gemini') || text.includes('API')){
    return 'AI ตรวจงานไม่สำเร็จ กรุณาตรวจ API Key หรือชนิดไฟล์ที่ส่งตรวจ';
  }

  return text || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

/* ทับ normalizeErrorMessage ให้สั้นและเป็นภาษาไทย */
function normalizeErrorMessage(err){
  return userFriendlyMessage(err?.message || err);
}

// =====================================================
// FIX PRINT - Print only selected section
// วางท้ายไฟล์ app.js
// =====================================================

function printSection(containerId){
  const source = document.getElementById(containerId);

  if(!source){
    toast('ไม่พบส่วนที่ต้องการพิมพ์');
    return;
  }

  // ลบ printArea เก่าก่อน ถ้ามี
  const old = document.getElementById('printArea');
  if(old) old.remove();

  // สร้างพื้นที่สำหรับพิมพ์เฉพาะส่วน
  const printArea = document.createElement('div');
  printArea.id = 'printArea';

  const title = document.createElement('div');
  title.innerHTML = `
    <h2 style="margin:0 0 8px 0;">AJ.Kanpitcha</h2>
    <div style="margin-bottom:16px;font-size:14px;">
      พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}
    </div>
  `;

  const clone = source.cloneNode(true);

  // เอาปุ่มพิมพ์ใน clone ออก กันซ้ำ
  clone.querySelectorAll('button, .print-btn').forEach(x => x.remove());

  printArea.appendChild(title);
  printArea.appendChild(clone);

  document.body.appendChild(printArea);
  document.body.classList.add('printing-section');

  const cleanup = () => {
    document.body.classList.remove('printing-section');
    const area = document.getElementById('printArea');
    if(area) area.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);

  setTimeout(() => {
    window.print();

    // กันบาง browser ไม่ยิง afterprint
    setTimeout(cleanup, 1000);
  }, 150);
}

function printCurrentPage(){
  window.print();
}

function ensurePrintButton(containerId){
  const box = document.getElementById(containerId);
  if(!box) return;

  if(box.querySelector('.print-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'print-btn';
  btn.innerText = 'พิมพ์ / บันทึก PDF';
  btn.onclick = function(){
    printSection(containerId);
  };

  box.prepend(btn);
}

function addPrintButtonsToReports(){
  [
    'teacherDashboardSummary',
    'teacherScoreReportBox',
    'teacherLeaveBoxList',
    'teacherSubmissionReportBox',
    'teacherExportBoxResult',
    'attendanceTable',
    'submissionStatusBox',
    'leaveHistoryBox'
  ].forEach(id => ensurePrintButton(id));
}

// =====================================================
// PHASE 15 - Learning Rules + Student Logout
// =====================================================

let CURRENT_RULES = null;
let RULES_FORCE_ACCEPT = false;

function studentLogout(){
  try {
    localStorage.removeItem('student');
    localStorage.removeItem('student_info');
    localStorage.removeItem('student_token');
    localStorage.removeItem('studentId');
    localStorage.removeItem('courseId');
  } catch(e) {}

  STUDENT = null;

  toast('ออกจากระบบแล้ว');
  showPage('pageStudentLogin');
}

async function openLearningRulesPage(forceAccept){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  RULES_FORCE_ACCEPT = !!forceAccept;

  showPage('pageLearningRules');

  const imageBox = document.getElementById('rulesImageBox');
  const textBox = document.getElementById('rulesTextBox');

  if(imageBox) imageBox.innerHTML = '';
  if(textBox) textBox.innerHTML = 'กำลังโหลดกติกา...';

  try {
    const { data, error } = await sb.rpc('student_get_learning_rules_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    if(!data.ok){
      if(textBox) textBox.innerHTML = `<div class="student-empty">${esc(data.message)}</div>`;
      return;
    }

    CURRENT_RULES = data.data || {};
    renderLearningRules(CURRENT_RULES, RULES_FORCE_ACCEPT);

  } catch(err) {
    if(textBox){
      textBox.innerHTML = `<div class="student-empty">โหลดกติกาไม่สำเร็จ: ${esc(normalizeErrorMessage(err))}</div>`;
    }
  }
}

function renderLearningRules(rule, forceAccept){
  const imageBox = document.getElementById('rulesImageBox');
  const textBox = document.getElementById('rulesTextBox');
  const acceptBtn = document.getElementById('rulesAcceptBtn');
  const closeBtn = document.getElementById('rulesCloseBtn');
  const closeTopBtn = document.getElementById('rulesCloseTopBtn');

  if(imageBox){
    imageBox.innerHTML = rule.image_url
      ? `<img src="${esc(rule.image_url)}" alt="กติกาการเรียน" style="max-width:100%;border-radius:24px;border:1px solid var(--aj-line);box-shadow:0 12px 30px rgba(63,0,117,.08);">`
      : '';
  }

  if(textBox){
    textBox.innerHTML = `
      <div style="white-space:pre-wrap;line-height:1.8;font-size:17px;">
        ${esc(rule.rule_text || 'ยังไม่ได้ตั้งค่ากติกาการเรียน')}
      </div>
    `;
  }

  const accepted = !!rule.accepted;

  if(forceAccept && !accepted){
    if(acceptBtn) acceptBtn.style.display = '';
    if(closeBtn) closeBtn.style.display = 'none';
    if(closeTopBtn) closeTopBtn.style.display = 'none';
  }else{
    if(acceptBtn) acceptBtn.style.display = 'none';
    if(closeBtn) closeBtn.style.display = '';
    if(closeTopBtn) closeTopBtn.style.display = '';
  }
}

async function acceptLearningRules(){
  if(!STUDENT) return toast('กรุณาเข้าสู่ระบบก่อน');

  showLoading('กำลังบันทึกการรับทราบ', 'ระบบกำลังบันทึกว่าท่านรับทราบกติกาแล้ว...');

  try {
    const { data, error } = await sb.rpc('student_accept_learning_rules_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'บันทึกไม่สำเร็จ');
      return;
    }

    toast('รับทราบกติกาเรียบร้อยแล้ว');

    if(CURRENT_RULES) CURRENT_RULES.accepted = true;

    showPage('pageDashboard');

  } catch(err) {
    hideLoading();
    alert('บันทึกการรับทราบไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

function closeLearningRules(){
  showPage('pageDashboard');
}

// =====================================================
// PHASE 15 - Override studentLogin to show learning rules
// =====================================================

async function studentLogin(){
  const studentId = val('loginStudentId');
  const fullName = val('loginFullName');

  if(!studentId) return toast('กรุณากรอกรหัสนักศึกษา');
  if(!fullName) return toast('กรุณากรอกชื่อ - นามสกุล');

  showLoading('กำลังค้นหานักศึกษา', 'ระบบกำลังค้นหารหัสหรือชื่อ...');

  try {
    const { data, error } = await sb.rpc('student_login_v2', {
      p_student_id: studentId,
      p_full_name: fullName
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
      return;
    }

    STUDENT = data.data;

    try {
      localStorage.setItem('student', JSON.stringify(STUDENT));
    } catch(e) {}

    const info = document.getElementById('studentInfo');
    if(info){
      info.innerText = `${STUDENT.course_name || STUDENT.display_name || ''} | ${STUDENT.student_id} ${STUDENT.full_name}`;
    }

    await showRulesAfterStudentLogin();

  } catch(err) {
    hideLoading();
    alert('เข้าสู่ระบบนักศึกษาไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

async function showRulesAfterStudentLogin(){
  if(!STUDENT){
    showPage('pageDashboard');
    return;
  }

  try {
    const { data, error } = await sb.rpc('student_get_learning_rules_v2', {
      p_course_id: STUDENT.course_id,
      p_student_id: STUDENT.student_id
    });

    if(error) throw error;

    const rule = data.data || {};
    CURRENT_RULES = rule;

    if(rule.accepted){
      // เคยยอมรับแล้ว: ให้เห็นกติกาเหมือนเดิม แต่มีปุ่มปิดแทน
      showPage('pageLearningRules');
      renderLearningRules(rule, false);
    }else{
      // ครั้งแรก: ต้องกดยอมรับก่อนเข้าเมนู
      showPage('pageLearningRules');
      renderLearningRules(rule, true);
    }

  } catch(err) {
    // ถ้าโหลดกติกาพัง ไม่บล็อกการเข้าใช้งาน
    console.error('showRulesAfterStudentLogin error:', err);
    showPage('pageDashboard');
  }
}

// =====================================================
// PHASE 15 - Teacher Learning Rules
// =====================================================

async function teacherLoadLearningRules(){
  const textEl = document.getElementById('teacherRuleText');
  const imgBox = document.getElementById('teacherRulePreviewImage');
  const previewText = document.getElementById('teacherRulePreviewText');

  if(textEl) textEl.value = '';
  if(imgBox) imgBox.innerHTML = '';
  if(previewText) previewText.innerHTML = 'กำลังโหลดกติกา...';

  try {
    const { data, error } = await sb.rpc('student_get_learning_rules_v2', {
      p_course_id: null,
      p_student_id: ''
    });

    if(error) throw error;

    const rule = data.data || {};

    if(textEl) textEl.value = rule.rule_text || '';

    if(imgBox){
      imgBox.innerHTML = rule.image_url
        ? `<img src="${esc(rule.image_url)}" style="max-width:100%;border-radius:22px;border:1px solid var(--aj-line);">`
        : '<div class="student-empty">ยังไม่มีภาพกติกา</div>';
    }

    if(previewText){
      previewText.innerHTML = `<div style="white-space:pre-wrap;line-height:1.8;">${esc(rule.rule_text || '-')}</div>`;
    }

  } catch(err) {
    if(previewText){
      previewText.innerHTML = `<div class="student-empty">โหลดกติกาไม่สำเร็จ: ${esc(normalizeErrorMessage(err))}</div>`;
    }
  }
}

async function teacherSaveLearningRules(){
  const token = getTeacherToken();
  const ruleText = val('teacherRuleText');
  const fileInput = document.getElementById('teacherRuleImage');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  if(!token) return toast('กรุณาเข้าสู่ระบบอาจารย์');
  if(!ruleText) return toast('กรุณากรอกข้อความกติกา');

  showLoading('กำลังบันทึกกติกา', 'ระบบกำลังบันทึกข้อความและรูปภาพกติกา...');

  try {
    let imageUrl = '';
    let imageName = '';

    if(file){
      if(file.size > 5 * 1024 * 1024) throw new Error('ไฟล์ภาพใหญ่เกิน 5 MB');
      if(!['image/jpeg','image/png'].includes(file.type)) throw new Error('รองรับเฉพาะ JPG หรือ PNG');

      const safeName = makeSafeFileName(file.name);
      const path = `rules_${Date.now()}_${safeName}`;

      const upload = await sb.storage
        .from('rules')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if(upload.error) throw upload.error;

      imageUrl = sb.storage
        .from('rules')
        .getPublicUrl(path)
        .data
        .publicUrl;

      imageName = file.name;
    }

    const { data, error } = await sb.rpc('teacher_save_learning_rules_v2', {
      p_token: token,
      p_rule_text: ruleText,
      p_image_url: imageUrl,
      p_image_name: imageName
    });

    if(error) throw error;

    hideLoading();

    if(!data.ok){
      toast(data.message || 'บันทึกกติกาไม่สำเร็จ');
      return;
    }

    toast('บันทึกกติกาการเรียนสำเร็จ');
    if(fileInput) fileInput.value = '';

    await teacherLoadLearningRules();

  } catch(err) {
    hideLoading();
    alert('บันทึกกติกาไม่สำเร็จ: ' + normalizeErrorMessage(err));
  }
}

// =====================================================
// FIX - Student Logout stuck page
// วางท้ายไฟล์ app.js
// =====================================================

function studentLogout(){
  try {
    localStorage.removeItem('student');
    localStorage.removeItem('student_info');
    localStorage.removeItem('student_token');
    localStorage.removeItem('studentId');
    localStorage.removeItem('courseId');
    localStorage.removeItem('STUDENT');
  } catch(e) {}

  // ล้างตัวแปรนักศึกษา
  STUDENT = null;

  // ปิด loading ถ้ามี
  try {
    hideLoading();
  } catch(e) {
    const loading = document.getElementById('loading');
    if(loading) loading.classList.add('hidden');
  }

  // ปิด print mode / sidebar state ที่อาจค้าง
  document.body.classList.remove('printing-section');
  document.body.classList.remove('teacher-sidebar-hidden');

  // ล้างข้อมูลที่แสดงบนหัวหน้าเมนูนักศึกษา
  const studentInfo = document.getElementById('studentInfo');
  if(studentInfo) studentInfo.innerText = '';

  // ล้างช่อง login ถ้ามี
  const loginStudentId = document.getElementById('loginStudentId');
  const loginFullName = document.getElementById('loginFullName');

  if(loginStudentId) loginStudentId.value = '';
  if(loginFullName) loginFullName.value = '';

  // หา page login ที่มีอยู่จริงใน index.html
  const possibleLoginPages = [
    'pageStudentLogin',
    'pageLogin',
    'pageStudentAuth',
    'pageHome',
    'pageWelcome'
  ];

  let targetPage = null;

  for(const id of possibleLoginPages){
    if(document.getElementById(id)){
      targetPage = id;
      break;
    }
  }

  // ถ้าเจอหน้า login ให้ไปหน้านั้น
  if(targetPage){
    showPage(targetPage);
    toast('ออกจากระบบแล้ว');
    return;
  }

  // ถ้าไม่เจอจริง ๆ ให้ fallback แบบบังคับซ่อนทุกหน้า แล้วแสดงหน้าแรกที่มี
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.classList.remove('active'));

  if(pages.length){
    pages[0].classList.add('active');
  }

  toast('ออกจากระบบแล้ว');
}
