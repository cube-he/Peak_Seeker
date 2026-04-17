#!/bin/bash
echo "============================================================"
echo "  VolunteerHelper FULL Feature Test (All 95+ endpoints)"
echo "============================================================"
BASE="http://localhost:3003/api/v1"
WEB="http://localhost:3004"
PASS=0; FAIL=0; WARN=0; TOKEN=""; TEACHER_TOKEN=""; ADMIN_TOKEN=""

test_api() {
  local name="$1" method="$2" url="$3" data="$4" expect="$5"
  if [ "$method" = "GET" ] || [ "$method" = "DELETE" ]; then
    resp=$(curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" "$url")
  else
    resp=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$data" "$url")
  fi
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed \$d)
  if [ "$code" = "$expect" ]; then
    echo "  [PASS] $name ($code)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $name — expect $expect, got $code"
    echo "         $(echo "$body" | head -c 300)"
    FAIL=$((FAIL+1))
  fi
  echo "$body" > /tmp/last_resp.json
}

test_page() {
  local name="$1" url="$2"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "200" ]; then
    echo "  [PASS] $name ($code)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $name — HTTP $code"
    FAIL=$((FAIL+1))
  fi
}

test_redirect() {
  local name="$1" url="$2"
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 "$url")
  if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; then
    echo "  [PASS] $name -> redirect ($code)"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $name — expected redirect, got $code"
    FAIL=$((FAIL+1))
  fi
}

extract() { python3 -c "import json;print(json.load(open('/tmp/last_resp.json')).get('$1',''))" 2>/dev/null; }
extract_nested() { python3 -c "import json;d=json.load(open('/tmp/last_resp.json'));print(d$1)" 2>/dev/null; }

# ============================================================
echo ""
echo "=== A. Frontend Pages (Public) ==="
test_page "Home /" "$WEB/"
test_page "Login" "$WEB/login"
test_page "Register" "$WEB/register"
test_page "Universities" "$WEB/universities"
test_page "Universities/1" "$WEB/universities/1"
test_page "Majors" "$WEB/majors"
test_page "Majors/1" "$WEB/majors/1"

echo ""
echo "=== B. Frontend Pages (Protected — should redirect) ==="
test_redirect "Teacher dashboard" "$WEB/teacher/dashboard"
test_redirect "Teacher students" "$WEB/teacher/students"
test_redirect "Teacher students/create" "$WEB/teacher/students/create"
test_redirect "Teacher plans" "$WEB/teacher/plans"
test_redirect "Student dashboard" "$WEB/student/dashboard"
test_redirect "Student profile" "$WEB/student/profile"
test_redirect "Student plans" "$WEB/student/plans"
test_redirect "Student recommend" "$WEB/student/recommend"
test_redirect "Admin dashboard" "$WEB/admin/dashboard"
test_redirect "Admin users" "$WEB/admin/users"
test_redirect "Admin data import" "$WEB/admin/data/import"
test_redirect "Admin config" "$WEB/admin/config"

# ============================================================
echo ""
echo "=== C. Auth (register 3 roles) ==="
# Register admin
test_api "Register ADMIN" POST "$BASE/auth/register" '{"username":"fta_admin","password":"Admin123","role":"ADMIN"}' "201"
ADMIN_TOKEN=$(extract accessToken)

# Register teacher
test_api "Register TEACHER" POST "$BASE/auth/register" '{"username":"fta_teacher","password":"Teacher1","role":"TEACHER"}' "201"
TEACHER_TOKEN=$(extract accessToken)

# Register student
test_api "Register STUDENT" POST "$BASE/auth/register" '{"username":"fta_student","password":"Student1"}' "201"
STUDENT_TOKEN=$(extract accessToken)
STUDENT_USER_ID=$(python3 -c "import json;print(json.load(open('/tmp/last_resp.json'))['user']['id'])" 2>/dev/null)
STUDENT_PROFILE_ID=$(python3 -c "import json;print(json.load(open('/tmp/last_resp.json'))['user']['studentProfile']['id'])" 2>/dev/null)

# Validation tests
test_api "Register dup (409)" POST "$BASE/auth/register" '{"username":"fta_admin","password":"Admin123"}' "409"
test_api "Register weak pw (400)" POST "$BASE/auth/register" '{"username":"ftaX","password":"weak"}' "400"
test_api "Login OK" POST "$BASE/auth/login" '{"username":"fta_teacher","password":"Teacher1"}' "200"
TEACHER_TOKEN=$(extract accessToken)
test_api "Login bad pw (401)" POST "$BASE/auth/login" '{"username":"fta_teacher","password":"Wrong123"}' "401"

# Refresh
REFRESH=$(extract refreshToken 2>/dev/null)
TOKEN=$TEACHER_TOKEN
test_api "Refresh token" POST "$BASE/auth/refresh" "{\"refreshToken\":\"$(python3 -c "import json;d=json.load(open('/tmp/last_resp.json'));print(d.get('refreshToken',''))" 2>/dev/null)\"}" "200"

# ============================================================
echo ""
echo "=== D. User Profile ==="
TOKEN=$STUDENT_TOKEN
test_api "[Student] GET /users/me" GET "$BASE/users/me" "" "200"
test_api "[Student] PUT profile" PUT "$BASE/users/me" '{"realName":"TestStudent"}' "200"
test_api "[Student] PUT exam-info" PUT "$BASE/users/me/exam-info" '{"province":"四川","score":580,"rank":8000}' "200"
test_api "[Student] PUT preferences" PUT "$BASE/users/me/preferences" '{"preferredProvinces":["四川","重庆"]}' "200"

TOKEN=$TEACHER_TOKEN
test_api "[Teacher] GET /users/me" GET "$BASE/users/me" "" "200"
test_api "[Teacher] PUT profile" PUT "$BASE/users/me" '{"realName":"TestTeacher"}' "200"

# ============================================================
echo ""
echo "=== E. Teacher Module ==="
TOKEN=$TEACHER_TOKEN
test_api "[Teacher] My stats" GET "$BASE/teachers/me/stats" "" "200"

# ============================================================
echo ""
echo "=== F. Student Management (by teacher) ==="
TOKEN=$TEACHER_TOKEN
test_api "[Teacher] Create student" POST "$BASE/students" '{"username":"fta_stu2","password":"Student2","realName":"Created Student"}' "201"
CREATED_STU_ID=$(python3 -c "import json;d=json.load(open('/tmp/last_resp.json'));print(d.get('id',d.get('studentProfile',{}).get('id','')))" 2>/dev/null)
test_api "[Teacher] List students" GET "$BASE/students" "" "200"
if [ -n "$CREATED_STU_ID" ]; then
  test_api "[Teacher] Get student detail" GET "$BASE/students/$CREATED_STU_ID" "" "200"
  test_api "[Teacher] Update student profile" PUT "$BASE/students/$CREATED_STU_ID/profile" '{"province":"四川","totalScore":550}' "200"
fi

# ============================================================
echo ""
echo "=== G. Universities ==="
TOKEN=$STUDENT_TOKEN
test_api "List default" GET "$BASE/universities?page=1&pageSize=2" "" "200"
test_api "Search" GET "$BASE/universities?keyword=%E5%8C%97%E4%BA%AC&page=1&pageSize=5" "" "200"
test_api "Filter 985" GET "$BASE/universities?is985=true&page=1&pageSize=5" "" "200"
test_api "Filter 211" GET "$BASE/universities?is211=true&page=1&pageSize=5" "" "200"
test_api "Filter DFC" GET "$BASE/universities?isDoubleFirstClass=true&page=1&pageSize=5" "" "200"
test_api "Filter province" GET "$BASE/universities?province=%E5%8C%97%E4%BA%AC&page=1&pageSize=5" "" "200"
test_api "Filter type" GET "$BASE/universities?type=%E7%BB%BC%E5%90%88&page=1&pageSize=5" "" "200"
test_api "Sort" GET "$BASE/universities?sortBy=name&sortOrder=desc&page=1&pageSize=2" "" "200"
test_api "Hot" GET "$BASE/universities/hot?limit=5" "" "200"
test_api "Filters" GET "$BASE/universities/filters" "" "200"
test_api "Detail 1" GET "$BASE/universities/1" "" "200"
test_api "Detail 404" GET "$BASE/universities/999999" "" "404"
test_api "Majors of uni 1" GET "$BASE/universities/1/majors" "" "200"
test_api "Admissions of uni 1" GET "$BASE/universities/1/admissions" "" "200"

# ============================================================
echo ""
echo "=== H. Majors ==="
test_api "List" GET "$BASE/majors?page=1&pageSize=2" "" "200"
test_api "Search" GET "$BASE/majors?keyword=%E8%AE%A1%E7%AE%97%E6%9C%BA&page=1&pageSize=5" "" "200"
test_api "Category filter" GET "$BASE/majors?category=%E5%B7%A5%E5%AD%A6&page=1&pageSize=5" "" "200"
test_api "Level filter" GET "$BASE/majors?level=%E6%9C%AC%E7%A7%91&page=1&pageSize=5" "" "200"
test_api "Categories" GET "$BASE/majors/categories" "" "200"
test_api "Hot" GET "$BASE/majors/hot?limit=5" "" "200"
test_api "Detail 1" GET "$BASE/majors/1" "" "200"
test_api "Unis of major 1" GET "$BASE/majors/1/universities" "" "200"

# ============================================================
echo ""
echo "=== I. Admissions ==="
test_api "By score" GET "$BASE/admissions/by-score?score=600&province=%E5%9B%9B%E5%B7%9D&year=2024&page=1&pageSize=5" "" "200"
test_api "By rank" GET "$BASE/admissions/by-rank?rank=5000&province=%E5%9B%9B%E5%B7%9D&year=2024&page=1&pageSize=5" "" "200"
test_api "Statistics" GET "$BASE/admissions/statistics?universityId=1" "" "200"

# ============================================================
echo ""
echo "=== J. Favorites ==="
TOKEN=$STUDENT_TOKEN
test_api "List empty" GET "$BASE/favorites" "" "200"
test_api "Add uni fav" POST "$BASE/favorites" '{"type":"university","universityId":1}' "201"
test_api "Add uni dup (409)" POST "$BASE/favorites" '{"type":"university","universityId":1}' "409"
test_api "Add major fav" POST "$BASE/favorites" '{"type":"major","majorId":1}' "201"
test_api "List all" GET "$BASE/favorites" "" "200"
test_api "List by type" GET "$BASE/favorites?type=university" "" "200"

# ============================================================
echo ""
echo "=== K. History ==="
test_api "History" GET "$BASE/history" "" "200"
test_api "History limit" GET "$BASE/history?limit=10" "" "200"

# ============================================================
echo ""
echo "=== L. Plans (Teacher creates for student) ==="
TOKEN=$TEACHER_TOKEN
if [ -n "$STUDENT_PROFILE_ID" ]; then
  test_api "[Teacher] List plans" GET "$BASE/plans" "" "200"
fi

# ============================================================
echo ""
echo "=== M. Recommend ==="
TOKEN=$TEACHER_TOKEN
test_api "Recommend unis" POST "$BASE/recommend/universities" '{"score":580,"rank":8000,"province":"四川"}' "201"
if [ -n "$STUDENT_PROFILE_ID" ]; then
  test_api "Light recommend" GET "$BASE/recommend/light/$STUDENT_PROFILE_ID" "" "200"
fi

# ============================================================
echo ""
echo "=== N. Notifications ==="
TOKEN=$STUDENT_TOKEN
test_api "Unread notifications" GET "$BASE/notifications/unread" "" "200"
test_api "Mark all read" POST "$BASE/notifications/read-all" '{}' "200"

# ============================================================
echo ""
echo "=== O. Data Import ==="
TOKEN=$ADMIN_TOKEN
test_api "Import health" GET "$BASE/data-import/health" "" "200"
test_api "Import stats" GET "$BASE/data-import/stats" "" "200"

# ============================================================
echo ""
echo "=== P. Admin Data Import ==="
TOKEN=$ADMIN_TOKEN
test_api "Import records" GET "$BASE/admin/data/records?page=1&pageSize=10" "" "200"
test_api "Data quality" GET "$BASE/admin/data/quality" "" "200"

# ============================================================
echo ""
echo "=== Q. Admin User Management ==="
TOKEN=$ADMIN_TOKEN
test_api "List all users" GET "$BASE/users/admin/all?page=1&pageSize=10" "" "200"
if [ -n "$STUDENT_USER_ID" ]; then
  test_api "Get user permissions" GET "$BASE/users/admin/$STUDENT_USER_ID/permissions" "" "200"
  test_api "Set user permissions" PUT "$BASE/users/admin/$STUDENT_USER_ID/permissions" '{"permissions":{"canExport":true}}' "200"
fi

# ============================================================
echo ""
echo "=== R. AI Config ==="
TOKEN=$ADMIN_TOKEN
test_api "AI config list" GET "$BASE/ai-config" "" "200"
test_api "AI config default" GET "$BASE/ai-config/default" "" "200"

# ============================================================
echo ""
echo "=== S. Health Check ==="
TOKEN=""
test_api "Health" GET "$BASE/health" "" "200"

# ============================================================
echo ""
echo "=== T. Logout & Auth Guard ==="
TOKEN=$STUDENT_TOKEN
test_api "Student logout" POST "$BASE/auth/logout" '{}' "200"
test_api "After logout (401)" GET "$BASE/users/me" "" "401"

TOKEN=""
test_api "No-token favorites (401)" GET "$BASE/favorites" "" "401"
test_api "No-token plans (401)" GET "$BASE/plans" "" "401"
test_api "No-token history (401)" GET "$BASE/history" "" "401"
test_api "Public uni (200)" GET "$BASE/universities?page=1&pageSize=1" "" "200"
test_api "Public major (200)" GET "$BASE/majors?page=1&pageSize=1" "" "200"

echo ""
echo "============================================================"
echo "  TOTAL: $PASS passed / $FAIL failed / $WARN warnings"
echo "============================================================"

# Cleanup
echo ""
echo "Cleaning up test data..."
cd /home/ubuntu/apps/volunteer-helper/apps/server
node -e "
const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const users=await p.user.findMany({where:{username:{startsWith:'fta_'}}});
  const ids=users.map(u=>u.id);
  if(ids.length){
    await p.favorite.deleteMany({where:{userId:{in:ids}}}).catch(()=>{});
    await p.searchHistory.deleteMany({where:{userId:{in:ids}}}).catch(()=>{});
    await p.notification.deleteMany({where:{userId:{in:ids}}}).catch(()=>{});
    await p.volunteerPlan.deleteMany({where:{OR:[{userId:{in:ids}},{createdById:{in:ids}}]}}).catch(()=>{});
    await p.studentProfile.deleteMany({where:{userId:{in:ids}}}).catch(()=>{});
    await p.teacherProfile.deleteMany({where:{userId:{in:ids}}}).catch(()=>{});
    await p.user.deleteMany({where:{id:{in:ids}}});
  }
  console.log('Cleaned '+ids.length+' test users');
  await p.\$disconnect();
})().catch(e=>console.error('Cleanup error:',e.message));
" 2>&1
