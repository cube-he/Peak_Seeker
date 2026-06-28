// 28 字段的 4 组分块(渲染顺序 + 中文标签)。key 必须与后端 DORM_FIELD_KEYS 一致。
export interface DormFieldGroup {
  title: string;
  fields: Array<{ key: string; label: string }>;
}

export const DORM_FIELD_GROUPS: DormFieldGroup[] = [
  {
    title: '住宿条件',
    fields: [
      { key: 'multiCampus', label: '多校区' },
      { key: 'loftBed', label: '上床下桌' },
      { key: 'roomCapacity', label: '几人间' },
      { key: 'dormAirConditioner', label: '宿舍空调' },
      { key: 'privateBathroom', label: '独立卫浴' },
      { key: 'hotWaterSchedule', label: '洗澡热水时段' },
      { key: 'washingMachine', label: '洗衣机' },
      { key: 'dormPowerLimit', label: '宿舍限电瓦数' },
    ],
  },
  {
    title: '教学管理',
    fields: [
      { key: 'classroomAirConditioner', label: '教室空调' },
      { key: 'allNightStudyRoom', label: '通宵自习室' },
      { key: 'nightPowerCut', label: '夜间断电' },
      { key: 'nightNetworkCut', label: '夜间断网' },
      { key: 'dormInspection', label: '查寝情况' },
      { key: 'curfewTime', label: '晚归门禁时间' },
      { key: 'morningEveningStudy', label: '早晚自习' },
      { key: 'morningRun', label: '晨跑要求' },
      { key: 'runningCheckIn', label: '跑步打卡要求' },
    ],
  },
  {
    title: '网络',
    fields: [
      { key: 'campusNetworkSpeed', label: '校园网速度' },
      { key: 'campusNetworkPrice', label: '校园网价格' },
      { key: 'freshmanComputer', label: '大一带电脑' },
    ],
  },
  {
    title: '周边生活',
    fields: [
      { key: 'hasSubway', label: '地铁' },
      { key: 'distanceToCity', label: '市区距离' },
      { key: 'transportConvenience', label: '交通便利' },
      { key: 'foodDelivery', label: '点外卖' },
      { key: 'canteenPrice', label: '食堂价格' },
      { key: 'supermarketPrice', label: '超市价格' },
      { key: 'expressDelivery', label: '收发快递' },
      { key: 'sharedBikes', label: '共享单车' },
    ],
  },
];
