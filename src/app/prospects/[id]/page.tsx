import { ProspectDetailPage } from "@/components/prospect-detail-page";
export default async function Page({params}:{params:Promise<{id:string}>}){return <ProspectDetailPage id={(await params).id}/>;}
