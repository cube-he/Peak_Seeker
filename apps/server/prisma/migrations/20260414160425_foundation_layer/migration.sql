-- CreateTable
CREATE TABLE `universities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `code` VARCHAR(50) NULL,
    `province` VARCHAR(50) NULL,
    `city` VARCHAR(100) NULL,
    `university_type` VARCHAR(50) NULL,
    `university_level` VARCHAR(50) NULL,
    `running_level` VARCHAR(50) NULL,
    `running_nature` VARCHAR(50) NULL,
    `is_double_first_class` BOOLEAN NOT NULL DEFAULT false,
    `is_985` BOOLEAN NOT NULL DEFAULT false,
    `is_211` BOOLEAN NOT NULL DEFAULT false,
    `university_tags` JSON NULL,
    `university_grade` VARCHAR(50) NULL,
    `discipline_evaluation_level` VARCHAR(50) NULL,
    `has_master_program` BOOLEAN NOT NULL DEFAULT false,
    `has_doctoral_program` BOOLEAN NOT NULL DEFAULT false,
    `master_program_count` INTEGER NULL,
    `master_programs` JSON NULL,
    `doctoral_program_count` INTEGER NULL,
    `doctoral_programs` JSON NULL,
    `campus_area` DECIMAL(10, 2) NULL,
    `transfer_difficulty` TEXT NULL,
    `military_training_duration` VARCHAR(50) NULL,
    `is_featured` BOOLEAN NOT NULL DEFAULT false,
    `department` VARCHAR(200) NULL,
    `ranking` VARCHAR(50) NULL,
    `admission_guide` TEXT NULL,
    `rename_history` TEXT NULL,
    `postgrad_rate` VARCHAR(50) NULL,
    `soft_rating` VARCHAR(50) NULL,
    `soft_ranking` INTEGER NULL,
    `notes` TEXT NULL,

    UNIQUE INDEX `universities_code_key`(`code`),
    INDEX `universities_province_idx`(`province`),
    INDEX `universities_city_idx`(`city`),
    INDEX `universities_university_type_idx`(`university_type`),
    INDEX `universities_is_double_first_class_idx`(`is_double_first_class`),
    INDEX `universities_is_985_idx`(`is_985`),
    INDEX `universities_is_211_idx`(`is_211`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `majors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `code` VARCHAR(50) NULL,
    `major_category` VARCHAR(100) NULL,
    `major_level` VARCHAR(50) NULL,
    `discipline` VARCHAR(100) NULL,
    `major_type` VARCHAR(50) NULL,
    `major_notes` TEXT NULL,
    `is_restricted` BOOLEAN NOT NULL DEFAULT false,
    `major_level_detail` VARCHAR(100) NULL,
    `major_soft_rating` VARCHAR(50) NULL,
    `local_master_point` BOOLEAN NOT NULL DEFAULT false,
    `local_doctoral_point` BOOLEAN NOT NULL DEFAULT false,
    `employment_rate` DECIMAL(5, 2) NULL,
    `avg_salary` INTEGER NULL,
    `employment_direction` TEXT NULL,

    INDEX `majors_major_category_idx`(`major_category`),
    INDEX `majors_major_level_idx`(`major_level`),
    INDEX `majors_discipline_idx`(`discipline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollment_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `major_id` INTEGER NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `plan_count` INTEGER NULL,
    `plan_notes` TEXT NULL,
    `batch` VARCHAR(50) NULL,
    `level` VARCHAR(50) NULL,
    `subjects` VARCHAR(100) NULL,
    `subject_requirements` TEXT NULL,
    `duration` VARCHAR(20) NULL,
    `tuition` INTEGER NULL,
    `is_sino_foreign` BOOLEAN NOT NULL DEFAULT false,
    `local_master_point` VARCHAR(200) NULL,
    `local_doctoral_point` VARCHAR(200) NULL,
    `group_code` VARCHAR(50) NULL,
    `group_name` VARCHAR(200) NULL,
    `group_majors` TEXT NULL,
    `group_plan_count` INTEGER NULL,
    `is_new` BOOLEAN NOT NULL DEFAULT false,
    `old_batch` VARCHAR(50) NULL,
    `discipline_eval` VARCHAR(50) NULL,
    `is_national_feature` BOOLEAN NOT NULL DEFAULT false,
    `major_ranking` VARCHAR(100) NULL,
    `major_honor` TEXT NULL,

    INDEX `enrollment_plans_year_idx`(`year`),
    INDEX `enrollment_plans_province_idx`(`province`),
    INDEX `enrollment_plans_university_id_idx`(`university_id`),
    INDEX `enrollment_plans_major_id_idx`(`major_id`),
    INDEX `enrollment_plans_batch_idx`(`batch`),
    INDEX `enrollment_plans_year_province_batch_idx`(`year`, `province`, `batch`),
    UNIQUE INDEX `enrollment_plans_university_id_major_id_year_province_key`(`university_id`, `major_id`, `year`, `province`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admission_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `major_id` INTEGER NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `major_min_score` INTEGER NULL,
    `major_min_rank` INTEGER NULL,
    `major_avg_score` INTEGER NULL,
    `major_avg_rank` INTEGER NULL,
    `major_max_score` INTEGER NULL,
    `major_max_rank` INTEGER NULL,
    `major_admission_count` INTEGER NULL,
    `group_min_score` INTEGER NULL,
    `group_min_rank` INTEGER NULL,
    `group_admission_count` INTEGER NULL,
    `filing_min_score` INTEGER NULL,
    `filing_min_rank` INTEGER NULL,
    `subjects` VARCHAR(50) NULL,
    `batch` VARCHAR(50) NULL,
    `university_min_score` INTEGER NULL,
    `university_min_rank` INTEGER NULL,
    `university_avg_score` INTEGER NULL,
    `university_avg_rank` INTEGER NULL,
    `university_max_score` INTEGER NULL,
    `university_max_rank` INTEGER NULL,
    `university_admission_count` INTEGER NULL,

    INDEX `admission_records_year_idx`(`year`),
    INDEX `admission_records_province_idx`(`province`),
    INDEX `admission_records_university_id_idx`(`university_id`),
    INDEX `admission_records_major_id_idx`(`major_id`),
    INDEX `admission_records_major_min_score_idx`(`major_min_score`),
    INDEX `admission_records_major_min_rank_idx`(`major_min_rank`),
    INDEX `admission_records_batch_idx`(`batch`),
    INDEX `admission_records_year_province_batch_idx`(`year`, `province`, `batch`),
    UNIQUE INDEX `admission_records_university_id_major_id_year_province_key`(`university_id`, `major_id`, `year`, `province`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `real_name` VARCHAR(100) NULL,
    `gender` VARCHAR(10) NULL,
    `birth_date` DATE NULL,
    `avatar` VARCHAR(500) NULL,
    `ethnicity` VARCHAR(50) NULL,
    `province` VARCHAR(50) NULL,
    `city` VARCHAR(100) NULL,
    `exam_type` VARCHAR(50) NULL,
    `exam_year` SMALLINT NULL,
    `score` SMALLINT NULL,
    `rank` INTEGER NULL,
    `subjects` JSON NULL,
    `batch` VARCHAR(50) NULL,
    `preferred_provinces` JSON NULL,
    `preferred_cities` JSON NULL,
    `preferred_majors` JSON NULL,
    `preferred_university_types` JSON NULL,
    `career_direction` TEXT NULL,
    `vip_level` ENUM('FREE', 'BASIC', 'PREMIUM', 'EXPERT') NOT NULL DEFAULT 'FREE',
    `vip_expire_at` DATETIME(3) NULL,
    `role` ENUM('ADMIN', 'TEACHER', 'STUDENT') NOT NULL DEFAULT 'STUDENT',
    `permission_overrides` JSON NULL,
    `last_login_at` DATETIME(3) NULL,
    `last_login_ip` VARCHAR(50) NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_phone_key`(`phone`),
    INDEX `users_province_idx`(`province`),
    INDEX `users_exam_year_idx`(`exam_year`),
    INDEX `users_vip_level_idx`(`vip_level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teacher_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `school` VARCHAR(200) NULL,
    `is_supervisor` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `teacher_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `teacher_id` INTEGER NULL,
    `province` VARCHAR(50) NULL DEFAULT '四川',
    `city` VARCHAR(100) NULL,
    `high_school` VARCHAR(200) NULL,
    `class_info` VARCHAR(50) NULL,
    `status` ENUM('ACTIVE', 'GRADUATED', 'DROPPED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `id_number_encrypted` VARCHAR(500) NULL,
    `parent_phone` VARCHAR(20) NULL,
    `is_rural` BOOLEAN NOT NULL DEFAULT false,
    `exam_type` ENUM('PHYSICS', 'HISTORY', 'COMPREHENSIVE_LIBERAL', 'COMPREHENSIVE_SCIENCE') NULL,
    `exam_year` SMALLINT NULL,
    `total_score` SMALLINT NULL,
    `provincial_rank` INTEGER NULL,
    `exam_source` ENUM('REAL_EXAM', 'MOCK_EXAM', 'ESTIMATED') NULL,
    `subject_scores` JSON NULL,
    `first_choice` VARCHAR(50) NULL,
    `re_choices` JSON NULL,
    `score_chinese` SMALLINT NULL,
    `score_math` SMALLINT NULL,
    `score_english` SMALLINT NULL,
    `score_first_choice` SMALLINT NULL,
    `score_sub1` SMALLINT NULL,
    `score_sub2` SMALLINT NULL,
    `strong_subjects` JSON NULL,
    `weak_subjects` JSON NULL,
    `height` DECIMAL(5, 1) NULL,
    `weight` DECIMAL(5, 1) NULL,
    `vision` VARCHAR(50) NULL,
    `color_blind` BOOLEAN NOT NULL DEFAULT false,
    `color_weak` BOOLEAN NOT NULL DEFAULT false,
    `physical_limits` JSON NULL,
    `career_plan` ENUM('POSTGRADUATE', 'EMPLOYMENT', 'ABROAD', 'PUBLIC_SERVANT', 'UNDECIDED') NULL,
    `priority_mode` ENUM('UNIVERSITY_FIRST', 'MAJOR_FIRST', 'CITY_FIRST', 'BALANCED') NULL,
    `stay_preference` ENUM('LOCAL_ONLY', 'PREFER_LOCAL', 'NO_PREFERENCE', 'PREFER_OUTSIDE') NULL,
    `career_direction` VARCHAR(500) NULL,
    `military_interest` BOOLEAN NOT NULL DEFAULT false,
    `teacher_interest` BOOLEAN NOT NULL DEFAULT false,
    `stay_in_province` ENUM('LOCAL_ONLY', 'PREFER_LOCAL', 'NO_PREFERENCE', 'PREFER_OUTSIDE') NULL,
    `preferred_provinces` JSON NULL,
    `preferred_cities` JSON NULL,
    `preferred_majors` JSON NULL,
    `preferred_universities` JSON NULL,
    `preferred_major_categories` JSON NULL,
    `preferred_university_types` JSON NULL,
    `preferred_tags` JSON NULL,
    `excluded_provinces` JSON NULL,
    `excluded_cities` JSON NULL,
    `excluded_universities` JSON NULL,
    `excluded_majors` JSON NULL,
    `accept_level` ENUM('STRICT', 'MODERATE', 'RELAXED', 'UNDECIDED') NULL,
    `tuition_budget` ENUM('LOW', 'MEDIUM', 'HIGH', 'UNLIMITED') NULL,
    `accept_sino_foreign` BOOLEAN NOT NULL DEFAULT false,
    `accept_private` ENUM('STRICT', 'MODERATE', 'RELAXED', 'UNDECIDED') NOT NULL DEFAULT 'UNDECIDED',
    `accept_cooperation` ENUM('STRICT', 'MODERATE', 'RELAXED', 'UNDECIDED') NOT NULL DEFAULT 'UNDECIDED',
    `special_program` JSON NULL,
    `other_requirements` TEXT NULL,
    `interests` JSON NULL,
    `personality_type` VARCHAR(50) NULL,
    `self_description` TEXT NULL,
    `tags` JSON NULL,
    `service_year` SMALLINT NOT NULL DEFAULT 2026,
    `data_version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `student_profiles_user_id_key`(`user_id`),
    INDEX `student_profiles_teacher_id_idx`(`teacher_id`),
    INDEX `student_profiles_province_idx`(`province`),
    INDEX `student_profiles_exam_year_idx`(`exam_year`),
    INDEX `student_profiles_status_idx`(`status`),
    INDEX `student_profiles_exam_type_total_score_idx`(`exam_type`, `total_score`),
    INDEX `student_profiles_service_year_idx`(`service_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `volunteer_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `student_id` INTEGER NOT NULL,
    `created_by_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `name` VARCHAR(200) NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NULL,
    `items` JSON NULL,
    `strategy` VARCHAR(50) NULL,
    `status` ENUM('DRAFT', 'PENDING_REVIEW', 'REVIEWING', 'APPROVED', 'REJECTED', 'FINALIZED', 'PUBLISHED', 'OUTDATED') NOT NULL DEFAULT 'DRAFT',
    `is_favorite` BOOLEAN NOT NULL DEFAULT false,
    `plan_batch` ENUM('EARLY_BATCH', 'FIRST_BATCH', 'SECOND_BATCH', 'SPECIAL_BATCH') NULL,
    `exam_source` ENUM('REAL_EXAM', 'MOCK_EXAM', 'ESTIMATED') NULL,
    `version_no` INTEGER NOT NULL DEFAULT 1,
    `parent_version_id` INTEGER NULL,
    `version_note` VARCHAR(500) NULL,
    `score_used` SMALLINT NULL,
    `rank_used` INTEGER NULL,
    `algorithm_params` JSON NULL,
    `priority_mode` ENUM('UNIVERSITY_FIRST', 'MAJOR_FIRST', 'CITY_FIRST', 'BALANCED') NULL,
    `range_up` INTEGER NULL,
    `range_down` INTEGER NULL,
    `bin_size` INTEGER NULL,
    `total_groups` INTEGER NULL,
    `bonus_rules` JSON NULL,
    `ai_score` DECIMAL(5, 2) NULL,
    `ai_analysis` JSON NULL,
    `risk_level` VARCHAR(20) NULL,
    `is_final` BOOLEAN NOT NULL DEFAULT false,
    `finalized_at` DATETIME(3) NULL,
    `finalized_by` INTEGER NULL,
    `export_count` INTEGER NOT NULL DEFAULT 0,
    `data_version` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `exam_note` VARCHAR(500) NULL,

    INDEX `volunteer_plans_student_id_idx`(`student_id`),
    INDEX `volunteer_plans_created_by_id_idx`(`created_by_id`),
    INDEX `volunteer_plans_user_id_idx`(`user_id`),
    INDEX `volunteer_plans_year_idx`(`year`),
    INDEX `volunteer_plans_status_idx`(`status`),
    INDEX `volunteer_plans_parent_version_id_idx`(`parent_version_id`),
    UNIQUE INDEX `volunteer_plans_student_id_plan_batch_version_no_key`(`student_id`, `plan_batch`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `plan_id` INTEGER NOT NULL,
    `sequence` SMALLINT NOT NULL,
    `gradient` ENUM('CHONG', 'WEN', 'BAO') NOT NULL,
    `university_id` INTEGER NOT NULL,
    `university_name` VARCHAR(200) NOT NULL,
    `university_code` VARCHAR(50) NULL,
    `group_code` VARCHAR(50) NULL,
    `group_name` VARCHAR(200) NULL,
    `major_id` INTEGER NOT NULL,
    `major_name` VARCHAR(200) NOT NULL,
    `major_code` VARCHAR(50) NULL,
    `anchor_major` VARCHAR(200) NOT NULL,
    `group_major_count` INTEGER NOT NULL,
    `recommended_order` VARCHAR(500) NULL,
    `full_major_ranking` JSON NULL,
    `subject_requirement` VARCHAR(200) NULL,
    `school_nature` VARCHAR(100) NULL,
    `school_tags` VARCHAR(500) NULL,
    `accept_adjust` BOOLEAN NOT NULL DEFAULT true,
    `score_25_group` INTEGER NULL,
    `rank_25_group` INTEGER NULL,
    `score_25_major` INTEGER NULL,
    `rank_25_major` INTEGER NULL,
    `score_24_major` INTEGER NULL,
    `rank_24_major` INTEGER NULL,
    `last_year_min_score` INTEGER NULL,
    `last_year_min_rank` INTEGER NULL,
    `last_year_avg_score` INTEGER NULL,
    `last_year_avg_rank` INTEGER NULL,
    `avg_min_rank_3y` INTEGER NULL,
    `plan_count` INTEGER NULL,
    `tuition` INTEGER NULL,
    `cleanliness` ENUM('CLEAN', 'MINOR_ISSUE', 'MODERATE_ISSUE', 'MAJOR_ISSUE') NULL,
    `selection_reason` TEXT NULL,
    `risk_warning` TEXT NULL,
    `adjustment_advice` VARCHAR(500) NULL,
    `is_manually_modified` BOOLEAN NOT NULL DEFAULT false,
    `original_item_id` INTEGER NULL,
    `composite_score` DECIMAL(6, 2) NULL,
    `score_breakdown` JSON NULL,

    INDEX `plan_items_plan_id_idx`(`plan_id`),
    INDEX `plan_items_university_id_idx`(`university_id`),
    INDEX `plan_items_major_id_idx`(`major_id`),
    UNIQUE INDEX `plan_items_plan_id_sequence_key`(`plan_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `plan_id` INTEGER NOT NULL,
    `reviewer_id` INTEGER NOT NULL,
    `reviewer_role` ENUM('TEACHER', 'SUPERVISOR') NOT NULL,
    `action` ENUM('APPROVE', 'REJECT', 'REQUEST_CHANGE', 'COMMENT') NOT NULL,
    `comment` TEXT NULL,
    `item_annotations` JSON NULL,

    INDEX `plan_reviews_plan_id_idx`(`plan_id`),
    INDEX `plan_reviews_reviewer_id_idx`(`reviewer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_evaluations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `plan_id` INTEGER NOT NULL,
    `admission_result_id` INTEGER NULL,
    `matched_item_sequence` SMALLINT NULL,
    `matched_gradient` VARCHAR(50) NULL,
    `is_in_plan` BOOLEAN NOT NULL DEFAULT false,
    `evaluation_score` DECIMAL(5, 2) NULL,
    `evaluation_note` TEXT NULL,

    INDEX `plan_evaluations_plan_id_idx`(`plan_id`),
    INDEX `plan_evaluations_admission_result_id_idx`(`admission_result_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `search_histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` INTEGER NULL,
    `search_type` VARCHAR(50) NOT NULL,
    `search_params` JSON NOT NULL,
    `result_count` INTEGER NULL,

    INDEX `search_histories_user_id_idx`(`user_id`),
    INDEX `search_histories_search_type_idx`(`search_type`),
    INDEX `search_histories_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` INTEGER NOT NULL,
    `favorite_type` VARCHAR(50) NOT NULL,
    `university_id` INTEGER NULL,
    `major_id` INTEGER NULL,
    `notes` TEXT NULL,

    INDEX `favorites_user_id_idx`(`user_id`),
    INDEX `favorites_favorite_type_idx`(`favorite_type`),
    UNIQUE INDEX `favorites_user_id_favorite_type_university_id_major_id_key`(`user_id`, `favorite_type`, `university_id`, `major_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comparisons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` INTEGER NULL,
    `comparison_type` VARCHAR(50) NOT NULL,
    `item_ids` JSON NOT NULL,

    INDEX `comparisons_user_id_idx`(`user_id`),
    INDEX `comparisons_comparison_type_idx`(`comparison_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `order_no` VARCHAR(50) NOT NULL,
    `product_type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `payment_method` VARCHAR(50) NULL,
    `payment_status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `paid_at` DATETIME(3) NULL,
    `transaction_id` VARCHAR(100) NULL,

    UNIQUE INDEX `orders_order_no_key`(`order_no`),
    INDEX `orders_user_id_idx`(`user_id`),
    INDEX `orders_order_no_idx`(`order_no`),
    INDEX `orders_payment_status_idx`(`payment_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_segments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `exam_type` VARCHAR(50) NOT NULL,
    `score` SMALLINT NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `cumulative_count` INTEGER NOT NULL,

    INDEX `score_segments_year_idx`(`year`),
    INDEX `score_segments_province_idx`(`province`),
    INDEX `score_segments_exam_type_idx`(`exam_type`),
    INDEX `score_segments_score_idx`(`score`),
    UNIQUE INDEX `score_segments_year_province_exam_type_score_key`(`year`, `province`, `exam_type`, `score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `desc` VARCHAR(500) NULL,

    UNIQUE INDEX `system_configs_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `batch` VARCHAR(50) NOT NULL,
    `exam_type` VARCHAR(50) NOT NULL,
    `batch_type` VARCHAR(50) NOT NULL,
    `score` SMALLINT NOT NULL,

    INDEX `batch_lines_year_idx`(`year`),
    INDEX `batch_lines_province_idx`(`province`),
    UNIQUE INDEX `batch_lines_year_province_batch_exam_type_key`(`year`, `province`, `batch`, `exam_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `batch` VARCHAR(100) NOT NULL,
    `exam_type` VARCHAR(50) NOT NULL,
    `volunteer_mode` VARCHAR(20) NOT NULL,
    `max_group_count` INTEGER NOT NULL,
    `max_major_per_group` INTEGER NOT NULL DEFAULT 6,
    `has_adjust_option` BOOLEAN NOT NULL DEFAULT true,
    `filing_ratio` VARCHAR(20) NULL,
    `admission_order` INTEGER NOT NULL,
    `description` TEXT NULL,
    `tiebreak_rules` JSON NULL,
    `eligibility_rules` JSON NULL,
    `algorithm_config` JSON NULL,

    INDEX `batch_configs_year_idx`(`year`),
    INDEX `batch_configs_province_idx`(`province`),
    UNIQUE INDEX `batch_configs_year_province_batch_exam_type_key`(`year`, `province`, `batch`, `exam_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_configs` (
    `id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `api_key_encrypted` TEXT NOT NULL,
    `api_base_url` VARCHAR(500) NULL,
    `model_name` VARCHAR(100) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_config_models` (
    `id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `config_id` VARCHAR(36) NOT NULL,
    `model_name` VARCHAR(100) NOT NULL,
    `display_name` VARCHAR(100) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,

    INDEX `ai_config_models_config_id_idx`(`config_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `major_recommendations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `student_profile_id` INTEGER NOT NULL,
    `recommend_type` ENUM('AI_GENERATED', 'MANUAL', 'HYBRID') NOT NULL,
    `major_category` VARCHAR(100) NOT NULL,
    `major_name` VARCHAR(200) NOT NULL,
    `match_score` DECIMAL(5, 2) NOT NULL,
    `reasons` JSON NULL,

    INDEX `major_recommendations_student_profile_id_idx`(`student_profile_id`),
    INDEX `major_recommendations_recommend_type_idx`(`recommend_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `major_name_mappings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `raw_name` VARCHAR(200) NOT NULL,
    `standard_name` VARCHAR(200) NOT NULL,
    `source` VARCHAR(100) NULL,

    INDEX `major_name_mappings_raw_name_idx`(`raw_name`),
    INDEX `major_name_mappings_standard_name_idx`(`standard_name`),
    UNIQUE INDEX `major_name_mappings_raw_name_source_key`(`raw_name`, `source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplementary_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `batch` VARCHAR(100) NOT NULL,
    `round_number` SMALLINT NOT NULL DEFAULT 1,
    `university_id` INTEGER NOT NULL,
    `university_name` VARCHAR(200) NOT NULL,
    `major_id` INTEGER NULL,
    `major_name` VARCHAR(200) NULL,
    `plan_count` INTEGER NULL,
    `requirements` TEXT NULL,
    `filing_min_score` INTEGER NULL,
    `filing_min_rank` INTEGER NULL,

    INDEX `supplementary_records_year_province_batch_idx`(`year`, `province`, `batch`),
    INDEX `supplementary_records_university_id_idx`(`university_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplementary_summaries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `batch` VARCHAR(100) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `total_rounds` SMALLINT NOT NULL DEFAULT 0,
    `total_plan_count` INTEGER NOT NULL DEFAULT 0,
    `supplementary_rate` DECIMAL(5, 2) NULL,

    INDEX `supplementary_summaries_university_id_idx`(`university_id`),
    UNIQUE INDEX `supplementary_summaries_year_province_batch_university_id_key`(`year`, `province`, `batch`, `university_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `ref_type` VARCHAR(50) NULL,
    `ref_id` INTEGER NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `read_at` DATETIME(3) NULL,

    INDEX `notifications_user_id_idx`(`user_id`),
    INDEX `notifications_is_read_idx`(`is_read`),
    INDEX `notifications_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` INTEGER NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` INTEGER NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `ip_address` VARCHAR(50) NULL,

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `file_name` VARCHAR(500) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `storage_path` VARCHAR(1000) NOT NULL,
    `storage_type` VARCHAR(50) NOT NULL DEFAULT 'local',
    `uploaded_by_id` INTEGER NULL,
    `entity_type` VARCHAR(50) NULL,
    `entity_id` INTEGER NULL,

    INDEX `file_records_uploaded_by_id_idx`(`uploaded_by_id`),
    INDEX `file_records_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `filing_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `year` SMALLINT NOT NULL,
    `province` VARCHAR(50) NOT NULL,
    `batch` VARCHAR(100) NOT NULL,
    `exam_type` VARCHAR(50) NOT NULL,
    `university_id` INTEGER NOT NULL,
    `university_name` VARCHAR(200) NOT NULL,
    `group_code` VARCHAR(50) NULL,
    `filing_min_score` INTEGER NULL,
    `filing_min_rank` INTEGER NULL,
    `filing_count` INTEGER NULL,
    `plan_count` INTEGER NULL,

    INDEX `filing_records_year_province_batch_idx`(`year`, `province`, `batch`),
    INDEX `filing_records_university_id_idx`(`university_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admission_results` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `student_profile_id` INTEGER NOT NULL,
    `year` SMALLINT NOT NULL,
    `university_name` VARCHAR(200) NOT NULL,
    `major_name` VARCHAR(200) NOT NULL,
    `batch` VARCHAR(100) NOT NULL,
    `is_adjusted` BOOLEAN NOT NULL DEFAULT false,

    INDEX `admission_results_student_profile_id_idx`(`student_profile_id`),
    INDEX `admission_results_year_idx`(`year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_share_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `plan_id` INTEGER NOT NULL,
    `token` VARCHAR(100) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `view_count` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `plan_share_links_token_key`(`token`),
    INDEX `plan_share_links_plan_id_idx`(`plan_id`),
    INDEX `plan_share_links_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `algorithm_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `version` VARCHAR(20) NOT NULL,
    `weights` JSON NOT NULL,
    `thresholds` JSON NOT NULL,
    `gradient_rule` JSON NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `algorithm_configs_name_version_key`(`name`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `enrollment_plans` ADD CONSTRAINT `enrollment_plans_university_id_fkey` FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_plans` ADD CONSTRAINT `enrollment_plans_major_id_fkey` FOREIGN KEY (`major_id`) REFERENCES `majors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admission_records` ADD CONSTRAINT `admission_records_university_id_fkey` FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admission_records` ADD CONSTRAINT `admission_records_major_id_fkey` FOREIGN KEY (`major_id`) REFERENCES `majors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_profiles` ADD CONSTRAINT `teacher_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `volunteer_plans` ADD CONSTRAINT `volunteer_plans_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `student_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `volunteer_plans` ADD CONSTRAINT `volunteer_plans_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `volunteer_plans` ADD CONSTRAINT `volunteer_plans_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `volunteer_plans` ADD CONSTRAINT `volunteer_plans_parent_version_id_fkey` FOREIGN KEY (`parent_version_id`) REFERENCES `volunteer_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_items` ADD CONSTRAINT `plan_items_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `volunteer_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_reviews` ADD CONSTRAINT `plan_reviews_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `volunteer_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_reviews` ADD CONSTRAINT `plan_reviews_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_evaluations` ADD CONSTRAINT `plan_evaluations_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `volunteer_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_evaluations` ADD CONSTRAINT `plan_evaluations_admission_result_id_fkey` FOREIGN KEY (`admission_result_id`) REFERENCES `admission_results`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `search_histories` ADD CONSTRAINT `search_histories_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_university_id_fkey` FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_major_id_fkey` FOREIGN KEY (`major_id`) REFERENCES `majors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comparisons` ADD CONSTRAINT `comparisons_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_config_models` ADD CONSTRAINT `ai_config_models_config_id_fkey` FOREIGN KEY (`config_id`) REFERENCES `ai_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
