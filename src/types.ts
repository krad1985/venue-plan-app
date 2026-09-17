export type Point = { x:number, y:number }
export type Wall = { id:string, points: Point[], color?:string }
export type VenueObject = {
  id:string
  type: 'rect_table' | 'round_table' | 'chair' | 'stage' | 'power_socket' | 'power_box' | 'note_pin' | 'door' | 'pillar'
  x:number
  y:number
  w:number
  h:number
  rotation:number
  label:string
  note?:string
  photo?:string // base64
}
export type Project = {
  id:string
  name:string
  venue:string
  date:string
  client:string
  createdAt:number
  updatedAt:number
  walls: Wall[]
  objects: VenueObject[]
  backgroundImage?: string // base64
  pxPerCm: number // 校正比例，例如 1cm = 2px
  scaleRef?: { pxLength:number, realCm:number }
  photos: string[] // 現場照片
  memo:string
}
