package local.mooncat.lab;

import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/store")
public class ShopController {
    private final JdbcTemplate jdbc;
    public ShopController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private static final List<Map<String,Object>> PRODUCTS = List.of(
        Map.of("id","lumina","name","루미나","price",2400,"description","푸른 대기 위로 빛나는 끝없는 오로라.","kind","빛의 행성","image","/static/planet-lumina.png"),
        Map.of("id","aurelia","name","아우렐리아","price",3800,"description","황금빛 고리 너머 펼쳐지는 새로운 지평.","kind","고리의 행성","image","/static/planet-aurelia.png"),
        Map.of("id","celestia","name","셀레스티아","price",1600,"description","푸른 얼음 아래 잠든 별의 기억.","kind","얼음의 행성","image","/static/planet-celestia.png")
    );
    private String user(HttpSession session) {
        Object id=session.getAttribute("userId");
        if(id==null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"로그인이 필요합니다.");
        return id.toString();
    }
    private Map<String,Object> product(String id) {
        return PRODUCTS.stream().filter(p->p.get("id").equals(id)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"행성을 찾을 수 없습니다."));
    }
    @ExceptionHandler(ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<?> error(ResponseStatusException e) {
        return org.springframework.http.ResponseEntity.status(e.getStatusCode()).body(Map.of("detail",e.getReason()));
    }
    @GetMapping("/catalog") public Map<String,Object> catalog() { return Map.of("products",PRODUCTS); }
    @GetMapping("/catalog/{id}") public Map<String,Object> detail(@PathVariable String id) { return product(id); }
    @GetMapping("/wallet") @Transactional
    public Map<String,Object> wallet(HttpSession session) {
        String uid=user(session);
        jdbc.update("INSERT INTO nebula_wallet(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)",uid);
        return Map.of("balance",jdbc.queryForObject("SELECT balance FROM nebula_wallet WHERE user_id=?",Integer.class,uid),"currency","CR");
    }
    @GetMapping({"/orders","/inventory"})
    public Map<String,Object> orders(HttpSession session) {
        String uid=user(session);
        List<Map<String,Object>> rows=jdbc.queryForList("SELECT id,planet_id,total,coupon,created_at FROM nebula_orders WHERE user_id=? ORDER BY id DESC",uid);
        for(Map<String,Object> row:rows) { row.put("created_at",row.get("created_at").toString()); row.put("product",product(row.get("planet_id").toString())); }
        return Map.of("orders",rows);
    }
    @PostMapping({"/quote","/purchase"}) @Transactional
    public Map<String,Object> checkout(@RequestBody Map<String,Object> data, HttpServletRequest request, HttpSession session) {
        String uid=user(session);
        if(!"1".equals(request.getHeader("X-Nebula-Shop"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"상점 요청 헤더가 필요합니다.");
        if(!(data.get("planet_id") instanceof String) || !(data.getOrDefault("coupon","") instanceof String)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"구매 정보를 확인해 주세요.");
        Map<String,Object> p=product((String)data.get("planet_id"));
        String coupon=((String)data.getOrDefault("coupon","")).trim().toUpperCase(java.util.Locale.ROOT);
        if(!coupon.isEmpty()&&!coupon.equals("NEBULA10")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"사용할 수 없는 쿠폰입니다.");
        int price=(Integer)p.get("price"), total=price*(coupon.isEmpty()?100:90)/100;
        jdbc.update("INSERT INTO nebula_wallet(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)",uid);
        int balance=jdbc.queryForObject("SELECT balance FROM nebula_wallet WHERE user_id=? FOR UPDATE",Integer.class,uid);
        if(!jdbc.queryForList("SELECT id FROM nebula_orders WHERE user_id=? AND planet_id=?",uid,p.get("id")).isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 보유한 행성입니다.");
        if(!coupon.isEmpty()&&!jdbc.queryForList("SELECT id FROM nebula_orders WHERE user_id=? AND coupon=?",uid,coupon).isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 사용한 쿠폰입니다.");
        if(balance<total) throw new ResponseStatusException(HttpStatus.CONFLICT,"크레딧 잔액이 부족합니다.");
        Map<String,Object> result=new LinkedHashMap<>(Map.of("planet_id",p.get("id"),"price",price,"discount",price-total,"total",total,"balance_after",balance-total));
        if(request.getRequestURI().endsWith("/purchase")) {
            jdbc.update("UPDATE nebula_wallet SET balance=balance-? WHERE user_id=?",total,uid);
            jdbc.update("INSERT INTO nebula_orders(user_id,planet_id,total,coupon) VALUES(?,?,?,?)",uid,p.get("id"),total,coupon.isEmpty()?null:coupon);
            result.put("order_id",jdbc.queryForObject("SELECT LAST_INSERT_ID()",Long.class));
        }
        return result;
    }
}
