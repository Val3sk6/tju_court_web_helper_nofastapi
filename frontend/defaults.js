export const CONFIG_VERSION = 1;

export const BUILTIN_PRESETS = [
  {
    id: 'builtin-morning',
    name: '内置：上午 09-10 点',
    config: { fields: [
      { FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '09:00', Endtime: '10:00' },
      { FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '09:00', Endtime: '10:00' },
      { FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '09:00', Endtime: '10:00' }
    ] }
  },
  {
    id: 'builtin-evening',
    name: '内置：晚上 20-21 点',
    config: { fields: [
      { FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '20:00', Endtime: '21:00' },
      { FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '20:00', Endtime: '21:00' },
      { FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '20:00', Endtime: '21:00' }
    ] }
  }
];

export function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function defaultFields() {
  return [
    { FieldNo: 'YMQX007', FieldName: '羽毛球07', BeginTime: '09:00', Endtime: '10:00' },
    { FieldNo: 'YMQX008', FieldName: '羽毛球08', BeginTime: '09:00', Endtime: '10:00' },
    { FieldNo: 'YMQX009', FieldName: '羽毛球09', BeginTime: '09:00', Endtime: '10:00' }
  ];
}

export function defaultConfig() {
  return {
    mode: 'stable',
    open_time: '21:00:00',
    target_date: todayPlus(7),
    threads: '',
    attempts: '',
    timeout: '10',
    venue_no: '005',
    field_type_no: '017',
    dry_run: false,
    fields: defaultFields()
  };
}
