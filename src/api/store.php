<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$products = array(
 'lumina'=>array('id'=>'lumina','name'=>'루미나','price'=>2400,'description'=>'푸른 대기 위로 빛나는 끝없는 오로라.','kind'=>'빛의 행성','image'=>'/static/planet-lumina.png'),
 'aurelia'=>array('id'=>'aurelia','name'=>'아우렐리아','price'=>3800,'description'=>'황금빛 고리 너머 펼쳐지는 새로운 지평.','kind'=>'고리의 행성','image'=>'/static/planet-aurelia.png'),
 'celestia'=>array('id'=>'celestia','name'=>'셀레스티아','price'=>1600,'description'=>'푸른 얼음 아래 잠든 별의 기억.','kind'=>'얼음의 행성','image'=>'/static/planet-celestia.png')
);
function queryShop($sql, $values=array()) {
 global $shopDb;
 $stmt=$shopDb->prepare($sql);
 if (!$stmt) throw new Exception('상점 DB 오류입니다.',500);
 if (count($values)) {
  $args=array(str_repeat('s',count($values)));
  foreach ($values as $i=>$value) { $values[$i]=$value; $args[]=&$values[$i]; }
  call_user_func_array(array($stmt,'bind_param'),$args);
 }
 if (!$stmt->execute()) throw new Exception('구매 요청을 처리하지 못했습니다.',500);
 $rows=array(); $meta=$stmt->result_metadata();
 if ($meta) {
  $row=array(); $refs=array();
  while ($field=$meta->fetch_field()) { $row[$field->name]=null; $refs[]=&$row[$field->name]; }
  call_user_func_array(array($stmt,'bind_result'),$refs);
  while ($stmt->fetch()) { $copy=array(); foreach($row as $key=>$val) $copy[$key]=$val; $rows[]=$copy; }
 }
 $stmt->close(); return $rows;
}
$shopDb=null;
try {
 $action=isset($_GET['action'])?$_GET['action']:'';
 $method=$_SERVER['REQUEST_METHOD'];
 $write=in_array($action,array('quote','purchase'),true);
 if ($method!==($write?'POST':'GET')) throw new Exception('허용하지 않는 메서드입니다.',405);
 if ($action==='catalog') { echo json_encode(array('products'=>array_values($products))); exit; }
 if (strpos($action,'catalog/')===0) {
  $id=substr($action,8); if(!isset($products[$id])) throw new Exception('행성을 찾을 수 없습니다.',404);
  echo json_encode($products[$id]); exit;
 }
 if (!in_array($action,array('wallet','orders','inventory','quote','purchase'),true)) throw new Exception('API를 찾을 수 없습니다.',404);
 if (empty($_SESSION['user_id'])) throw new Exception('로그인이 필요합니다.',401);
 $uid=$_SESSION['user_id']; session_write_close();
 $shopDb=new mysqli('db','root','P@ssw0rd','WebTest');
 if ($shopDb->connect_error) throw new Exception('상점 DB 연결 오류입니다.',500);
 $shopDb->set_charset('utf8mb4');
 $shopDb->autocommit(false);
 if ($action==='wallet') {
  queryShop('INSERT INTO nebula_wallet(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',array($uid));
  $rows=queryShop('SELECT balance FROM nebula_wallet WHERE user_id=?',array($uid));
  $result=array('balance'=>(int)$rows[0]['balance'],'currency'=>'CR');
 } elseif ($action==='orders'||$action==='inventory') {
  $rows=queryShop('SELECT id,planet_id,total,coupon,created_at FROM nebula_orders WHERE user_id=? ORDER BY id DESC',array($uid));
  foreach($rows as &$order) { $order['id']=(int)$order['id']; $order['total']=(int)$order['total']; $order['product']=$products[$order['planet_id']]; } unset($order);
  $result=array('orders'=>$rows);
 } else {
  if (!isset($_SERVER['HTTP_X_NEBULA_SHOP'])||$_SERVER['HTTP_X_NEBULA_SHOP']!=='1') throw new Exception('상점 요청 헤더가 필요합니다.',403);
  $data=json_decode(file_get_contents('php://input'),true);
  if (!is_array($data)||!isset($data['planet_id'])||!is_string($data['planet_id'])||(isset($data['coupon'])&&!is_string($data['coupon']))) throw new Exception('구매 정보를 확인해 주세요.',400);
  if (!isset($products[$data['planet_id']])) throw new Exception('행성을 찾을 수 없습니다.',404);
  $p=$products[$data['planet_id']]; $coupon=isset($data['coupon'])?strtoupper(trim($data['coupon'])):'';
  if ($coupon!==''&&$coupon!=='NEBULA10') throw new Exception('사용할 수 없는 쿠폰입니다.',400);
  $total=(int)($p['price']*($coupon!==''?90:100)/100);
  queryShop('INSERT INTO nebula_wallet(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',array($uid));
  $wallet=queryShop('SELECT balance FROM nebula_wallet WHERE user_id=? FOR UPDATE',array($uid)); $balance=(int)$wallet[0]['balance'];
  if (count(queryShop('SELECT id FROM nebula_orders WHERE user_id=? AND planet_id=?',array($uid,$p['id'])))) throw new Exception('이미 보유한 행성입니다.',409);
  if ($coupon!==''&&count(queryShop('SELECT id FROM nebula_orders WHERE user_id=? AND coupon=?',array($uid,$coupon)))) throw new Exception('이미 사용한 쿠폰입니다.',409);
  if ($balance<$total) throw new Exception('크레딧 잔액이 부족합니다.',409);
  $result=array('planet_id'=>$p['id'],'price'=>$p['price'],'discount'=>$p['price']-$total,'total'=>$total,'balance_after'=>$balance-$total);
  if ($action==='purchase') {
   queryShop('UPDATE nebula_wallet SET balance=balance-? WHERE user_id=?',array($total,$uid));
   queryShop('INSERT INTO nebula_orders(user_id,planet_id,total,coupon) VALUES(?,?,?,?)',array($uid,$p['id'],$total,$coupon!==''?$coupon:null));
   $result['order_id']=$shopDb->insert_id;
  }
 }
 $shopDb->commit(); echo json_encode($result);
} catch (Exception $e) {
 if ($shopDb) $shopDb->rollback();
 $status=$e->getCode(); http_response_code($status>=400&&$status<=599?$status:500);
 echo json_encode(array('detail'=>$status>=400&&$status<500?$e->getMessage():'상점 요청을 처리하지 못했습니다.'));
}
