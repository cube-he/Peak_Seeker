#!/bin/bash
echo "============================================================"
echo "  VolunteerHelper Full Feature Test"
echo "============================================================"
BASE="http://localhost:3003/api/v1"
WEB="http://localhost:3004"
PASS=0; FAIL=0; WARN=0; TOKEN=""

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
    echo "         $(echo "$body" | head -c 200)"
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

test_protected_page() {
  local name="$1" url="$2"
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 "$url")
  if [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; then
    echo "  [PASS] $name -> redirect ($code)"
    PASS=$((PASS+1))
  elif [ "$code" = "200" ]; then
    echo "  [WARN] $name -> 200 (may not be protected)"
    WARN=$((WARN+1))
  else
    echo "  [FAIL] $name — HTTP $code"
    FAIL=$((FAIL+1))
  fi
}

extract() { python3 -c "import json;print(json.load(open('/tmp/last_resp.json')).get('$1',''))" 2>/dev/null; }
extract_arr() { python3 -c "import json;d=json.load(open('/tmp/last_resp.json'));print(d[0]['$1'] if isinstance(d,list) and d else '')" 2>/dev/null; }

echo ""
echo "=== A. Frontend Pages ==="
echo "--- Public ---"
test_page "Home /" "$WEB/"
test_page "Login /login" "$WEB/login"
test_page "Register /register" "$WEB/register"
test_page "Universities /universities" "$WEB/universities"
test_page "Majors /majors" "$WEB/majors"

echo "--- Protected (should redirect) ---"
test_protected_page "/teacher/dashboard" "$WEB/teacher/dashboard"
test_protected_page "/teacher/students" "$WEB/teacher/students"
test_protected_page "/teacher/plans" "$WEB/teacher/plans"
test_protected_page "/student/dashboard" "$WEB/student/dashboard"
test_protected_page "/admin/dashboard" "$WEB/admin/dashboard"

echo ""
echo "=== B. Auth ==="
test_api "Register" POST "$BASE/auth/register" '{"username":"fulltest1","password":"FullTest1","email":"ft1@test.com"}' "201"
TOKEN=$(extract accessToken)
test_api "Register dup (409)" POST "$BASE/auth/register" '{"username":"fulltest1","password":"FullTest1"}' "409"
test_api "Register weak pw (400)" POST "$BASE/auth/register" '{"username":"fulltest9","password":"weak123"}' "400"
test_api "Register short name (400)" POST "$BASE/auth/register" '{"username":"ab","password":"Test1234"}' "400"

test_api "Login" POST "$BASE/auth/login" '{"username":"fulltest1","password":"FullTest1"}' "200"
TOKEN=$(extract accessToken)
REFRESH=$(extract refreshToken)
test_api "Login wrong pw (401)" POST "$BASE/auth/login" '{"username":"fulltest1","password":"Wrong123"}' "401"
test_api "Login no user (401)" POST "$BASE/auth/login" '{"username":"ghost999","password":"Test1234"}' "401"

test_api "Refresh token" POST "$BASE/auth/refresh" "{\"refreshToken\":\"$REFRESH\"}" "200"
TOKEN=$(extract accessToken)

echo ""
echo "=== C. User Profile ==="
test_api "GET /users/me" GET "$BASE/users/me" "" "200"
test_api "PUT /users/me" PUT "$BASE/users/me" '{"realName":"AutoTester"}' "200"
test_api "PUT exam-info" PUT "$BASE/users/me/exam-info" '{"province":"四川","score":600,"rank":5000}' "200"
test_api "PUT preferences" PUT "$BASE/users/me/preferences" '{"preferredProvinces":["四川","北京"]}' "200"

echo ""
echo "=== D. Universities ==="
test_api "List" GET "$BASE/universities?page=1&pageSize=2" "" "200"
test_api "Search keyword" GET "$BASE/universities?keyword=%E6%B8%85%E5%8D%8E&page=1&pageSize=5" "" "200"
test_api "Filter province" GET "$BASE/universities?province=%E5%8C%97%E4%BA%AC&page=1&pageSize=5" "" "200"
test_api "Filter 985" GET "$BASE/universities?is985=true&page=1&pageSize=5" "" "200"
test_api "Filter 211" GET "$BASE/universities?is211=true&page=1&pageSize=5" "" "200"
test_api "Filter DFC" GET "$BASE/universities?isDoubleFirstClass=true&page=1&pageSize=5" "" "200"
test_api "Filter type" GET "$BASE/universities?type=%E7%BB%BC%E5%90%88&page=1&pageSize=5" "" "200"
test_api "Sort desc" GET "$BASE/universities?sortBy=name&sortOrder=desc&page=1&pageSize=2" "" "200"
test_api "Hot" GET "$BASE/universities/hot?limit=10" "" "200"
test_api "Filters" GET "$BASE/universities/filters" "" "200"
test_api "Detail id=1" GET "$BASE/universities/1" "" "200"
test_api "Detail 404" GET "$BASE/universities/999999" "" "404"
test_api "Majors id=1" GET "$BASE/universities/1/majors" "" "200"
test_api "Admissions id=1" GET "$BASE/universities/1/admissions" "" "200"

echo ""
echo "=== E. Majors ==="
test_api "List" GET "$BASE/majors?page=1&pageSize=2" "" "200"
test_api "Search keyword" GET "$BASE/majors?keyword=%E8%AE%A1%E7%AE%97%E6%9C%BA&page=1&pageSize=5" "" "200"
test_api "Filter category" GET "$BASE/majors?category=%E5%B7%A5%E5%AD%A6&page=1&pageSize=5" "" "200"
test_api "Filter level" GET "$BASE/majors?level=%E6%9C%AC%E7%A7%91&page=1&pageSize=5" "" "200"
test_api "Categories" GET "$BASE/majors/categories" "" "200"
test_api "Hot" GET "$BASE/majors/hot?limit=10" "" "200"
test_api "Detail id=1" GET "$BASE/majors/1" "" "200"
test_api "Detail 404" GET "$BASE/majors/999999" "" "404"
test_api "Universities id=1" GET "$BASE/majors/1/universities" "" "200"

echo ""
echo "=== F. Admissions ==="
test_api "By score" GET "$BASE/admissions/by-score?score=600&province=%E5%9B%9B%E5%B7%9D&year=2024&page=1&pageSize=5" "" "200"
test_api "By rank" GET "$BASE/admissions/by-rank?rank=5000&province=%E5%9B%9B%E5%B7%9D&year=2024&page=1&pageSize=5" "" "200"
test_api "Statistics" GET "$BASE/admissions/statistics?universityId=1" "" "200"

echo ""
echo "=== G. Favorites ==="
test_api "List empty" GET "$BASE/favorites" "" "200"
test_api "Add university" POST "$BASE/favorites" '{"type":"university","universityId":1}' "201"
test_api "Add dup (409)" POST "$BASE/favorites" '{"type":"university","universityId":1}' "409"
test_api "Add major" POST "$BASE/favorites" '{"type":"major","majorId":1}' "201"
test_api "List with data" GET "$BASE/favorites" "" "200"
test_api "List by type" GET "$BASE/favorites?type=university" "" "200"
FAV_ID=$(extract_arr id)
if [ -n "$FAV_ID" ]; then
  test_api "Remove favorite" DELETE "$BASE/favorites/$FAV_ID" "" "200"
fi

echo ""
echo "=== H. History ==="
test_api "History default" GET "$BASE/history" "" "200"
test_api "History limit=10" GET "$BASE/history?limit=10" "" "200"

echo ""
echo "=== I. Plans ==="
test_api "List plans" GET "$BASE/plans" "" "200"
test_api "Create plan" POST "$BASE/plans" '{"name":"AutoTest Plan","year":2026,"province":"四川"}' "201"
PLAN_ID=$(extract id)
if [ -n "$PLAN_ID" ]; then
  test_api "Get plan" GET "$BASE/plans/$PLAN_ID" "" "200"
  test_api "Update plan" PUT "$BASE/plans/$PLAN_ID" '{"name":"AutoTest Updated"}' "200"
  test_api "Favorite plan" POST "$BASE/plans/$PLAN_ID/favorite" "" "200"
  test_api "Delete plan" DELETE "$BASE/plans/$PLAN_ID" "" "200"
fi

echo ""
echo "=== J. Recommend ==="
test_api "Recommend unis" POST "$BASE/recommend/universities" '{"score":600,"rank":5000,"province":"四川"}' "200"
test_api "Recommend plan" POST "$BASE/recommend/plan" '{"score":600,"rank":5000,"province":"四川","year":2026}' "200"

echo ""
echo "=== K. Data Import ==="
test_api "Health" GET "$BASE/data-import/health" "" "200"
test_api "Stats" GET "$BASE/data-import/stats" "" "200"

echo ""
echo "=== L. AI Config ==="
test_api "List" GET "$BASE/ai-config" "" "200"
test_api "Default" GET "$BASE/ai-config/default" "" "200"

echo ""
echo "=== M. Logout ==="
test_api "Logout" POST "$BASE/auth/logout" '{}' "200"
test_api "After logout (401)" GET "$BASE/users/me" "" "401"

echo ""
echo "=== N. No-Token Access ==="
TOKEN=""
test_api "No-token favorites (401)" GET "$BASE/favorites" "" "401"
test_api "No-token plans (401)" GET "$BASE/plans" "" "401"
test_api "No-token history (401)" GET "$BASE/history" "" "401"
test_api "No-token user (401)" GET "$BASE/users/me" "" "401"
test_api "Public uni list (200)" GET "$BASE/universities?page=1&pageSize=1" "" "200"
test_api "Public major list (200)" GET "$BASE/majors?page=1&pageSize=1" "" "200"

echo ""
echo "============================================================"
echo "  TOTAL: $PASS passed / $FAIL failed / $WARN warnings"
echo "============================================================"
