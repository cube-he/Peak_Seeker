-- Data migration: 把 student_profiles.preferred_majors 从扁平 ["A","B","C"]
-- 转成梯队 [{tier:1,majors:["A"]},{tier:2,majors:["B"]},{tier:3,majors:["C"]}]
--
-- 幂等保证: 守卫 `JSON_TYPE(...$[0]) = 'STRING'` 只匹配旧 shape (新 shape 第 0 项是 OBJECT)
-- 上限: 处理前 10 个专业 (实际数据通常 ≤5, 超过的极端 case 会被截断)

UPDATE student_profiles
SET preferred_majors = (
  SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'tier', i.idx + 1,
      'majors', JSON_ARRAY(JSON_UNQUOTE(JSON_EXTRACT(preferred_majors, CONCAT('$[', i.idx, ']'))))
    )
  )
  FROM (
    SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
    UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
  ) i
  WHERE JSON_TYPE(JSON_EXTRACT(preferred_majors, CONCAT('$[', i.idx, ']'))) IS NOT NULL
)
WHERE preferred_majors IS NOT NULL
  AND JSON_TYPE(preferred_majors) = 'ARRAY'
  AND JSON_LENGTH(preferred_majors) > 0
  AND JSON_TYPE(JSON_EXTRACT(preferred_majors, '$[0]')) = 'STRING';
