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

  ['teacherStudentCourse','teacherAttendanceCourse','teacherAssignmentCourse','teacherLeaveCourse'].forEach(id => {
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
            ${esc(a.item_column)} - ${esc(a.title)}
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
                <th>คอลัมน์</th>
                <th>ชิ้นงาน</th>
                <th>สถานะ</th>
                <th>เวลาส่งล่าสุด</th>
                <th>ไฟล์</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.item_column)}</td>
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
  return String(name || 'file')
    .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
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
      const path = `${STUDENT.course_id}/${STUDENT.student_id}_${Date.now()}_${safeName}`;

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
      'นำเข้านักศึกษา: ' + (d.importedStudents || 0)
    );

    await refreshTeacherCourses();

  } catch(err) {
    hideLoading();
    alert('ซิงค์ไม่สำเร็จ: ' + err.message);
  }
}
